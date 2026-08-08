"""
BETIX — audit_orchestration.py
Logique partagée pour décider si une analyse existante doit être servie,
régénérée (périmée), ou générée pour la première fois. Utilisée à la fois par
l'endpoint à la demande (routers/matches.py) et par le passage planifié
proactif (scripts/updates/scheduled_audit_pass.py) — un seul et même chemin
de décision, pour que les deux déclencheurs ne puissent jamais lancer deux
générations en parallèle sur le même match.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from app.services.ingestion.base_client import SupabaseREST
from scripts.updates.match_audit_script import run_audit, LIVE_RUN_ID

logger = logging.getLogger("betix.audit_orchestration")

# Au-delà, une analyse 'ready' est considérée périmée et regénérée si redemandée.
STALE_AFTER_HOURS = 18

# Au-delà, un verrou 'pending' est considéré bloqué (process mort avant d'avoir
# pu marquer ready/failed) et peut être repris par un nouveau déclencheur.
PENDING_LOCK_TIMEOUT_MINUTES = 5


def _parse_ts(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None


def get_existing_audit(db: SupabaseREST, sport: str, match_id: int) -> Optional[Dict[str, Any]]:
    rows = db.select_raw(
        "ai_match_audits",
        f"match_id=eq.{match_id}&sport=eq.{sport}&run_id=eq.{LIVE_RUN_ID}&limit=1",
    )
    return rows[0] if rows else None


def _is_stale(audit: Dict[str, Any], stale_hours: int) -> bool:
    ts = _parse_ts(audit.get("attempted_at"))
    if not ts:
        return True
    return datetime.now(timezone.utc) - ts > timedelta(hours=stale_hours)


def _pending_lock_expired(audit: Dict[str, Any]) -> bool:
    ts = _parse_ts(audit.get("attempted_at"))
    if not ts:
        return True
    return datetime.now(timezone.utc) - ts > timedelta(minutes=PENDING_LOCK_TIMEOUT_MINUTES)


async def ensure_audit(
    db: SupabaseREST,
    sport: str,
    match_id: int,
    provider: str = "claude",
    model_name: Optional[str] = None,
    stale_hours: int = STALE_AFTER_HOURS,
    generate_inline: bool = True,
) -> Dict[str, Any]:
    """
    Renvoie l'état courant de l'analyse pour un match, en déclenchant une
    génération si nécessaire (absente, périmée, ou verrou 'pending' bloqué).

    Args:
        generate_inline: si True, attend la génération avant de répondre
            (utilisé par le passage planifié, qui n'a pas de contrainte de
            latence HTTP). Si False, ne fait QUE poser le verrou 'pending' et
            retourne immédiatement — l'appelant (l'endpoint à la demande) est
            responsable de lancer `run_audit` en tâche de fond après ça.

    Returns:
        {"state": "ready", "audit": {...}}   — analyse valide et fraîche
        {"state": "pending", "audit": None}  — génération en cours (par cet
            appel ou un autre) ; le client doit re-interroger sous peu.
        {"state": "needs_generation", "audit": None}  — verrou posé,
            à l'appelant de lancer run_audit (uniquement si generate_inline=False).
    """
    existing = get_existing_audit(db, sport, match_id)

    if existing:
        status = existing.get("status", "ready")
        if status == "ready" and not _is_stale(existing, stale_hours):
            return {"state": "ready", "audit": existing}
        if status == "pending" and not _pending_lock_expired(existing):
            return {"state": "pending", "audit": None}
        # sinon : 'failed', 'pending' bloqué, ou 'ready' périmé -> régénérer

    if not generate_inline:
        # Pose le verrou tout de suite (avant de rendre la main à l'appelant)
        # pour qu'un deuxième client arrivant entre-temps voie 'pending'.
        db.upsert(
            "ai_match_audits",
            [{
                "match_id": match_id,
                "sport": sport,
                "run_id": LIVE_RUN_ID,
                "status": "pending",
                "attempted_at": datetime.now(timezone.utc).isoformat(),
            }],
            on_conflict="match_id,sport,run_id",
        )
        return {"state": "needs_generation", "audit": None}

    try:
        await run_audit(sport, match_id, provider=provider, model_name=model_name, run_id=LIVE_RUN_ID, db=db)
    except Exception as e:
        logger.error(f"ensure_audit: génération échouée pour {sport}#{match_id}: {e}")
        return {"state": "pending", "audit": None}

    refreshed = get_existing_audit(db, sport, match_id)
    if refreshed and refreshed.get("status") == "ready":
        return {"state": "ready", "audit": refreshed}
    return {"state": "pending", "audit": None}
