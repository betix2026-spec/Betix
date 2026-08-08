"""
BETIX — scheduled_audit_pass.py
Passage planifié léger : génère une analyse UNE FOIS par match top-tier dans
les ~24h avant coup d'envoi, s'il n'en a pas déjà une fraîche. Remplace
l'ancien batch (orchestrator_ai.py / batch_audit_next_days.py) qui
re-analysait chaque match jusqu'à 16 fois sur une fenêtre glissante de 3 jours.

Le "vrai" filet de sécurité reste la génération à la demande (routers/audits.py) :
un match hors scope, ou pas encore atteint par ce passage, génère quand même
son analyse au premier clic d'un utilisateur premium.

Tourne toutes les 30 minutes via APScheduler (voir app/main.py).

LIMITE CONNUE (tennis) : le schéma actuel n'a pas de colonne tour/genre sur
tennis_tournaments — impossible de distinguer ATP/WTA en base pour l'instant.
Le filtre "hommes uniquement" n'est donc PAS appliqué ci-dessous ; seul le
filtre par catégorie (grand_slam/masters_1000/atp_500) l'est. Ajouter cette
colonne (+ la remplir à l'ingestion) est un prérequis pour appliquer le
scope complet tel que décidé.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import List, Tuple

from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST
from app.engine.audit_orchestration import ensure_audit
from app.engine.tier_scope import (
    is_football_top_tier,
    is_basketball_top_tier,
    is_tennis_top_tier,
)

logger = logging.getLogger("betix.scheduled_audit_pass")

LOOKAHEAD_HOURS = 24


async def _eligible_by_league(db: SupabaseREST, table: str, is_top_tier_fn) -> List[int]:
    now = datetime.now(timezone.utc)
    window_end = now + timedelta(hours=LOOKAHEAD_HOURS)
    rows = db.select_raw(
        table,
        "select=id,league:league_id(api_id)"
        f"&date_time=gte.{now.isoformat()}"
        f"&date_time=lte.{window_end.isoformat()}"
        "&status=eq.scheduled",
    )
    eligible = []
    for r in rows:
        league_api_id = (r.get("league") or {}).get("api_id")
        if is_top_tier_fn(league_api_id):
            eligible.append(r["id"])
    return eligible


async def _eligible_tennis(db: SupabaseREST) -> List[int]:
    now = datetime.now(timezone.utc)
    window_end = now + timedelta(hours=LOOKAHEAD_HOURS)
    rows = db.select_raw(
        "tennis_matches",
        "select=id,tournament:tournament_id(category)"
        f"&date_time=gte.{now.isoformat()}"
        f"&date_time=lte.{window_end.isoformat()}"
        "&status=eq.scheduled",
    )
    eligible = []
    for r in rows:
        category = (r.get("tournament") or {}).get("category")
        # tour="ATP" forcé faute de donnée en base — voir LIMITE CONNUE ci-dessus.
        if is_tennis_top_tier(category, tour="ATP"):
            eligible.append(r["id"])
    return eligible


async def run_scheduled_pass() -> dict:
    """Point d'entrée appelé par APScheduler (voir app/main.py)."""
    settings = get_settings()
    db_analytics = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="analytics")
    db_public = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="public")

    football_ids = await _eligible_by_league(db_analytics, "football_matches", is_football_top_tier)
    basketball_ids = await _eligible_by_league(db_analytics, "basketball_matches", is_basketball_top_tier)
    tennis_ids = await _eligible_tennis(db_analytics)

    targets: List[Tuple[str, int]] = (
        [("football", mid) for mid in football_ids]
        + [("basketball", mid) for mid in basketball_ids]
        + [("tennis", mid) for mid in tennis_ids]
    )

    logger.info(f"Passage planifié : {len(targets)} matchs top-tier dans les {LOOKAHEAD_HOURS}h.")

    ready, errors = 0, 0
    for sport, match_id in targets:
        try:
            # ensure_audit ne fait rien (lecture seule, pas d'appel IA) si une
            # analyse fraîche existe déjà — c'est ce qui rend ce passage
            # idempotent d'un tour à l'autre plutôt que de re-générer en boucle.
            result = await ensure_audit(db_public, sport, match_id, generate_inline=True)
            if result["state"] == "ready":
                ready += 1
        except Exception as e:
            errors += 1
            logger.error(f"Erreur passage planifié {sport}#{match_id}: {e}")

    logger.info(f"Passage planifié terminé : {ready}/{len(targets)} prêtes, {errors} erreurs.")
    return {"scanned": len(targets), "ready": ready, "errors": errors}


if __name__ == "__main__":
    import asyncio

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    asyncio.run(run_scheduled_pass())
