"""
BETIX — backfill_public_matches.py
One-time backfill: syncs existing analytics.*_matches rows into public.matches
for all 3 sports.

Why this is needed: ingest_matches()/ingest_live_matches() (base_client.py)
and ingest_missing() (discover_matches.py) all silently failed to write to
public.matches — see the fix in those files for the root cause (a missing
DB-assigned "id" causing a swallowed KeyError, and a discovery path that
never attempted the public sync at all). That bug is now fixed, but only
takes effect for matches discovered/refreshed AFTER the fix ships. Existing
analytics rows need this one-time backfill to appear on the dashboard
immediately instead of waiting to be naturally re-discovered.

Safe to re-run: upsert on (api_sport_id, sport), so running this twice just
re-writes the same rows.

Usage:
    python backfill_public_matches.py                 # last 30 days -> next 30 days
    python backfill_public_matches.py --days 60        # wider window
    python backfill_public_matches.py --all             # every row, no date filter
"""

import asyncio
import argparse
import logging
import sys
import os
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.ingestion.football_client import FootballClient
from app.services.ingestion.basketball_client import BasketballClient
from app.services.ingestion.tennis_client import TennisClient

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s — %(message)s")
logger = logging.getLogger("betix.backfill_public_matches")

BATCH_SIZE = 200


async def backfill_sport(client, days: int | None):
    table = client._get_analytics_matches_table()
    sport = client.sport

    if not client._team_id_map: client._load_team_id_map()
    if not client._league_id_map: client._load_league_id_map()

    if days is not None:
        now = datetime.now(timezone.utc)
        start = (now - timedelta(days=days)).isoformat()
        end = (now + timedelta(days=days)).isoformat()
        query = f"select=*&date_time=gte.{start}&date_time=lte.{end}&order=date_time.asc"
    else:
        query = "select=*&order=date_time.asc"

    rows = client.analytics.select_raw(table, query)
    logger.info(f"[{sport}] {len(rows)} analytics rows to sync.")

    synced, skipped = 0, 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        public_rows = []
        for row in batch:
            public_row = client._build_public_match(row)
            if public_row:
                public_rows.append(public_row)
            else:
                skipped += 1

        if public_rows:
            try:
                client.public.upsert("matches", public_rows, on_conflict="api_sport_id,sport")
                synced += len(public_rows)
            except Exception as e:
                logger.error(f"[{sport}] Batch upsert error: {e}")

    logger.info(f"[{sport}] Done: {synced} synced, {skipped} skipped (missing team/league info).")
    return synced


async def main():
    parser = argparse.ArgumentParser(description="Backfill public.matches from analytics.*_matches")
    parser.add_argument("--days", type=int, default=30, help="Days before/after now to include (default: 30)")
    parser.add_argument("--all", action="store_true", help="Ignore --days, sync every row")
    args = parser.parse_args()

    days = None if args.all else args.days
    logger.info(f"Starting backfill (window: {'all time' if days is None else f'+/-{days}d'})...")

    total = 0
    for client_cls in (FootballClient, BasketballClient, TennisClient):
        client = client_cls()
        try:
            total += await backfill_sport(client, days)
        finally:
            await client.close()

    logger.info(f"Backfill complete: {total} matches synced to public.matches across all sports.")


if __name__ == "__main__":
    asyncio.run(main())
