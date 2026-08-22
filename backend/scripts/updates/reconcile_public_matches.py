"""
BETIX — reconcile_public_matches.py

Self-healing pass for public.matches (the ONLY table the dashboard's
client reads). Re-derives and upserts the public row for every non-
"scheduled" analytics match in a recent window from analytics.*_matches
(the source of truth), every 10 minutes.

Why this exists: on two separate occasions (2026-08-21 and 2026-08-22),
public.matches was found holding ONLY a rolling window of "upcoming"
rows — every live/finished/postponed/cancelled match had vanished
entirely (not stale, not duplicated — completely absent), while
analytics.*_matches held correct data throughout. Exhaustive review of
every write path in this codebase (discover_matches.py, the mark_*/
monitor_live.py upserters, process_daily_matches.py, orchestrator.py's
live sync) found no DELETE/TRUNCATE targeting public.matches anywhere,
and a live check ruled out the obvious alternative (a missing unique
constraint silently turning upserts into duplicate inserts — zero
duplicates were found). So something is removing these rows on a cycle
this codebase's own scheduled jobs don't control or explain — outside
this application (most likely a Supabase-side job/policy, or a manual
action against the database) rather than a bug in any function above.

This does not fix that root cause — it can't, from inside the app, if
the thing doing it isn't part of the app. What it does is bound the
damage: instead of staying broken for up to a day (until the next
natural status change re-triggers a sync), the affected matches get
rebuilt within 10 minutes of disappearing, every time.
"""

import asyncio
import logging
import sys
import os
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.services.ingestion.football_client import FootballClient
from app.services.ingestion.basketball_client import BasketballClient
from app.services.ingestion.tennis_client import TennisClient

logger = logging.getLogger("betix.reconcile_public_matches")

WINDOW_DAYS = 14


async def _reconcile_sport(sport: str, client_cls) -> dict:
    client = client_cls()
    table = f"{sport}_matches"
    since = (datetime.now(timezone.utc) - timedelta(days=WINDOW_DAYS)).strftime("%Y-%m-%dT00:00:00Z")

    try:
        rows = await asyncio.to_thread(
            client.analytics.select_raw,
            table,
            f"select=*&status=not.in.(scheduled)&date_time=gte.{since}&order=date_time.desc&limit=500",
        )
    except Exception as e:
        logger.error(f"Reconcile fetch error ({sport}): {e}")
        return {"candidates": 0, "synced": 0, "error": str(e)}

    synced = 0
    for row in rows or []:
        public_row = client._build_public_match(row)
        if not public_row:
            continue
        try:
            await asyncio.to_thread(client.public.upsert, "matches", [public_row], "api_sport_id,sport")
            synced += 1
        except Exception as e:
            logger.error(f"Reconcile sync error {sport} {row.get('api_id')}: {e}")

    return {"candidates": len(rows or []), "synced": synced}


async def run_reconciliation() -> dict:
    """Entry point for the 10-minute APScheduler job (see app/main.py)."""
    results = {}
    for sport, client_cls in [("football", FootballClient), ("basketball", BasketballClient), ("tennis", TennisClient)]:
        results[sport] = await _reconcile_sport(sport, client_cls)

    total_synced = sum(r.get("synced", 0) for r in results.values())
    if total_synced:
        logger.info(f"Reconcile: {results}")
    else:
        logger.debug(f"Reconcile: nothing to do ({results})")
    return results


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    asyncio.run(run_reconciliation())
