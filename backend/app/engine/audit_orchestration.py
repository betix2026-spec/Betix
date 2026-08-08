"""
BETIX — audit_orchestration.py
Shared logic for deciding whether an existing analysis should be served,
regenerated (stale), or generated for the first time. Used by both the
on-demand endpoint (routers/audits.py) and the proactive scheduled pass
(scripts/updates/scheduled_audit_pass.py) — one single decision path, so the
two triggers can never race each other on the same match.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from app.services.ingestion.base_client import SupabaseREST
from scripts.updates.match_audit_script import run_audit, LIVE_RUN_ID

logger = logging.getLogger("betix.audit_orchestration")

# Beyond this age, a 'ready' analysis is considered stale and regenerated if requested again.
STALE_AFTER_HOURS = 18

# Beyond this age, a 'pending' lock is considered stuck (process died before
# marking ready/failed) and can be reclaimed by a new trigger.
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
    Returns the current analysis state for a match, triggering a generation
    if needed (missing, stale, or a stuck 'pending' lock).

    Args:
        generate_inline: if True, waits for generation to finish before
            returning (used by the scheduled pass, which has no HTTP latency
            constraint). If False, only sets the 'pending' lock and returns
            immediately — the caller (the on-demand endpoint) is responsible
            for kicking off `run_audit` in the background afterward.

    Returns:
        {"state": "ready", "audit": {...}}   — a fresh, valid analysis
        {"state": "pending", "audit": None}  — generation in progress (from
            this call or another one); the client should poll again shortly.
        {"state": "needs_generation", "audit": None}  — lock set, caller must
            launch run_audit itself (only when generate_inline=False).
    """
    existing = get_existing_audit(db, sport, match_id)

    if existing:
        status = existing.get("status", "ready")
        if status == "ready" and not _is_stale(existing, stale_hours):
            return {"state": "ready", "audit": existing}
        if status == "pending" and not _pending_lock_expired(existing):
            return {"state": "pending", "audit": None}
        # otherwise: 'failed', a stuck 'pending', or a stale 'ready' -> regenerate

    if not generate_inline:
        # Set the lock right away (before returning to the caller) so a
        # second client arriving in the meantime sees 'pending' too.
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
        logger.error(f"ensure_audit: generation failed for {sport}#{match_id}: {e}")
        return {"state": "pending", "audit": None}

    refreshed = get_existing_audit(db, sport, match_id)
    if refreshed and refreshed.get("status") == "ready":
        return {"state": "ready", "audit": refreshed}
    return {"state": "pending", "audit": None}
