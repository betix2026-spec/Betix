"""
BETIX — grade_predictions_pass.py
Phase 3 scheduled pass: finds AI audits whose match has since finished and
grades each pick (won/lost/push/ungraded) against the real result, via
app.engine.prediction_grading. Feeds the admin "AI accuracy" view.

Runs every 30 minutes via APScheduler (see app/main.py), alongside the
proactive generation pass — this one is read/DB-only (no AI calls), so it's
cheap to run often. Capped at BATCH_LIMIT rows per pass so a large backlog
(e.g. the first run after this feature ships, grading years of historic
audits) can't block the event loop for too long; it just catches up over
several passes.
"""

import logging
import sys
import os
from datetime import datetime, timezone

# Path setup so this also works run directly (python scripts/updates/grade_predictions_pass.py),
# not just imported from within the running app (which already has the
# project root on sys.path via how uvicorn starts it).
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST
from app.engine.prediction_grading import fetch_match_result, grade_audit

logger = logging.getLogger("betix.grade_predictions_pass")

BATCH_LIMIT = 300


async def run_grading_pass() -> dict:
    """Entry point called by APScheduler (see app/main.py)."""
    settings = get_settings()
    db_public = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="public")
    db_analytics = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="analytics")

    rows = db_public.select_raw(
        "ai_match_audits",
        "select=id,match_id,sport,ai_analysis"
        "&status=eq.ready"
        "&graded_at=is.null"
        f"&limit={BATCH_LIMIT}",
    )

    if not rows:
        return {"scanned": 0, "graded": 0, "not_finished": 0, "errors": 0}

    graded, not_finished, errors = 0, 0, 0
    for row in rows:
        sport = row.get("sport")
        match_id = row.get("match_id")
        try:
            result = fetch_match_result(db_analytics, sport, match_id)
            if result is None:
                # Match not finished (or not found) yet — leave ungraded,
                # retried automatically on the next pass.
                not_finished += 1
                continue

            grading_results = grade_audit(row.get("ai_analysis") or {}, sport, result)
            db_public.update(
                "ai_match_audits",
                {
                    "graded_at": datetime.now(timezone.utc).isoformat(),
                    "grading_results": grading_results,
                },
                {"id": row["id"]},
            )
            graded += 1
        except Exception as e:
            errors += 1
            logger.error(f"Grading error {sport}#{match_id} (audit id={row.get('id')}): {e}")

    logger.info(
        f"Grading pass done: {graded} graded, {not_finished} not finished yet, "
        f"{errors} errors (scanned {len(rows)}/{BATCH_LIMIT} cap)."
    )
    return {"scanned": len(rows), "graded": graded, "not_finished": not_finished, "errors": errors}


if __name__ == "__main__":
    import asyncio

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    asyncio.run(run_grading_pass())
