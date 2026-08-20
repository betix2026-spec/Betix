"""
BETIX — scheduled_audit_pass.py
Lightweight scheduled pass: generates an analysis ONCE per top-tier match
within ~24h of kickoff, if it doesn't already have a fresh one. Replaces the
old batch (orchestrator_ai.py / batch_audit_next_days.py) which re-analyzed
every match up to 16 times over a rolling 3-day window.

The "real" safety net remains on-demand generation (routers/audits.py): a
match out of scope, or not yet reached by this pass, still generates its
analysis the moment a premium user asks for it.

Runs every 30 minutes via APScheduler (see app/main.py).

KNOWN LIMITATION (tennis): the current schema has no tour/gender column on
tennis_tournaments — there's no way to distinguish ATP/WTA in the database
yet. The "men only" filter is therefore NOT applied below; only the
category filter (grand_slam/masters_1000/atp_500) is. Adding that column
(and populating it at ingestion time) is a prerequisite for enforcing the
full scope as decided.
"""

import logging
import sys
import os
from datetime import datetime, timedelta, timezone
from typing import List, Tuple

# Path setup so this also works run directly (python scripts/updates/scheduled_audit_pass.py),
# not just imported from within the running app (which already has the
# project root on sys.path via how uvicorn starts it).
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

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
        # tour="ATP" is forced here since there's no such data in the DB yet — see KNOWN LIMITATION above.
        if is_tennis_top_tier(category, tour="ATP"):
            eligible.append(r["id"])
    return eligible


async def run_scheduled_pass() -> dict:
    """Entry point called by APScheduler (see app/main.py)."""
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

    logger.info(f"Scheduled pass: {len(targets)} top-tier matches within {LOOKAHEAD_HOURS}h.")

    ready, errors = 0, 0
    for sport, match_id in targets:
        try:
            # ensure_audit is a no-op (read-only, no AI call) if a fresh
            # analysis already exists — this is what makes the pass
            # idempotent between runs instead of regenerating in a loop.
            result = await ensure_audit(db_public, sport, match_id, generate_inline=True)
            if result["state"] == "ready":
                ready += 1
        except Exception as e:
            errors += 1
            logger.error(f"Scheduled pass error {sport}#{match_id}: {e}")

    logger.info(f"Scheduled pass done: {ready}/{len(targets)} ready, {errors} errors.")
    return {"scanned": len(targets), "ready": ready, "errors": errors}


if __name__ == "__main__":
    import asyncio

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    asyncio.run(run_scheduled_pass())
