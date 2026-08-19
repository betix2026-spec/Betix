"""
BETIX — discover_matches.py (AUTO-INGEST)
Final optimized version:
1. Smart discovery (Football range scan, silent daily Basketball scan).
2. Delta comparison against the DB (batch check).
3. Automatic ingestion of missing data (Analytics + Public schemas).
"""

import asyncio
import logging
import argparse
import sys
import os
from datetime import datetime, timedelta, timezone

# Path setup for imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.services.ingestion.football_client import FootballClient
from app.services.ingestion.basketball_client import BasketballClient
from app.services.ingestion.tennis_client import TennisClient

# Silence verbose logs
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s — %(message)s")
logger = logging.getLogger("betix.discovery")

async def get_missing_items(client, table: str, api_items: list[dict], sport: str):
    """Filters the API items down to those missing from the DB."""
    if not api_items:
        return []
        
    # Mapping api_id -> full_item
    id_map = {}
    for item in api_items:
        if sport == "football":
            mid = item.get("fixture", {}).get("id")
        elif sport == "tennis":
            mid = item.get("event_key")
        else:
            mid = item.get("id")
            
        if mid:
            id_map[mid] = item
            
    api_ids = list(id_map.keys())
    existing_ids = set()
    
    # Batch check DB
    chunk_size = 100
    for i in range(0, len(api_ids), chunk_size):
        chunk = api_ids[i:i+chunk_size]
        ids_str = ",".join(map(str, chunk))
        try:
            rows = client.analytics.select_raw(table, f"select=api_id&api_id=in.({ids_str})")
            for r in rows:
                existing_ids.add(r["api_id"])
        except Exception as e:
            logger.error(f"   ⚠️ DB Error during delta check: {e}")
            
    missing_items = [id_map[mid] for mid in api_ids if mid not in existing_ids]
    return missing_items

async def ingest_missing(client, missing_items: list[dict]):
    """Transforms and inserts the missing items into both schemas."""
    if not missing_items:
        return 0

    # Load the ID maps (needed for build_public_match)
    if not client._team_id_map: client._load_team_id_map()
    if not client._league_id_map: client._load_league_id_map()

    analytics_rows = []

    for item in missing_items:
        row = client._transform_match(item)
        if row:
            analytics_rows.append(row)

    if not analytics_rows:
        return 0

    try:
        # Prefer: return=representation means this returns the rows as
        # actually stored, including the DB-assigned "id" that
        # _build_public_match() needs below.
        upserted_rows = client.analytics.upsert(
            client._get_analytics_matches_table(), analytics_rows, on_conflict="api_id"
        )
    except Exception as e:
        logger.error(f"   ❌ Ingestion error (analytics): {e}")
        return 0

    # Explicitly sync to public.matches instead of assuming a DB-side
    # trigger will do it — that assumption is what left public.matches
    # empty (analytics kept filling up silently while nothing ever reached
    # the table the dashboard reads from). Upsert is idempotent, so this is
    # safe to run even if such a trigger does exist and still works.
    public_rows = []
    for row in upserted_rows:
        public_row = client._build_public_match(row)
        if public_row:
            public_rows.append(public_row)

    if public_rows:
        try:
            client.public.upsert("matches", public_rows, on_conflict="api_sport_id,sport")
        except Exception as e:
            logger.error(f"   ❌ Ingestion error (public sync): {e}")

    return len(upserted_rows)

async def discovery_football(start_date: str, end_date: str):
    logger.info(f"⚽ [FOOTBALL] Scanning range {start_date} to {end_date}...")
    client = FootballClient()
    try:
        all_api_items = []
        for api_league_id in client.league_ids.keys():
            params = {"league": api_league_id, "season": 2025, "from": start_date, "to": end_date}
            data = await client._api_get("/fixtures", params)
            all_api_items.extend(data.get("response", []))
            await asyncio.sleep(0.1)
            
        missing = await get_missing_items(client, "football_matches", all_api_items, "football")
        if missing:
            logger.info(f"   🚨 Found {len(missing)} missing Football matches. Ingesting...")
            count = await ingest_missing(client, missing)
            logger.info(f"   ✅ Ingested {count} Football matches.")
        else:
            logger.info("   ✅ Football is up to date.")
        return len(all_api_items), len(missing)
    finally:
        await client.close()

async def discovery_basketball(start_date_obj, days: int):
    logger.info(f"🏀 [BASKETBALL] Scanning {days} days...")
    client = BasketballClient()
    try:
        all_api_items = []
        target_leagues = set(client.league_ids.keys())
        total_days = days * 2 # -10 to +10 is 20 days
        for i in range(total_days):
            date_str = (start_date_obj + timedelta(days=i)).strftime("%Y-%m-%d")
            data = await client._api_get("/games", {"date": date_str})
            items = data.get("response", [])
            all_api_items.extend([it for it in items if it.get("league", {}).get("id") in target_leagues])
            await asyncio.sleep(0.05)
            
        missing = await get_missing_items(client, "basketball_matches", all_api_items, "basketball")
        if missing:
            logger.info(f"   🚨 Found {len(missing)} missing Basketball matches. Ingesting...")
            count = await ingest_missing(client, missing)
            logger.info(f"   ✅ Ingested {count} Basketball matches.")
        else:
            logger.info("   ✅ Basketball is up to date.")
        return len(all_api_items), len(missing)
    finally:
        await client.close()


async def discovery_tennis(start_date_obj, days: int):
    logger.info(f"🎾 [TENNIS] Scanning {days * 2} days...")
    client = TennisClient()
    try:
        # Load caches for valid matches filtering
        client._load_team_id_map()
        client._load_league_id_map()

        all_api_items = []
        total_days = days * 2
        for i in range(total_days):
            date_str = (start_date_obj + timedelta(days=i)).strftime("%Y-%m-%d")
            data = await client._api_get("", {"method": "get_fixtures", "date_start": date_str, "date_stop": date_str})
            items = data.get("result", [])
            
            for it in items:
                # Exclude doubles matches (simplified check)
                if "/" in it.get("event_first_player", "") or "&" in it.get("event_first_player", ""):
                    continue
                all_api_items.append(it)
                    
            await asyncio.sleep(0.05)

        missing = await get_missing_items(client, "tennis_matches", all_api_items, "tennis")
        if missing:
            logger.info(f"   🚨 Found {len(missing)} missing Tennis matches. Ingesting...")
            count = await ingest_missing(client, missing)
            logger.info(f"   ✅ Ingested {count} Tennis matches.")
        else:
            logger.info("   ✅ Tennis is up to date.")
        return len(all_api_items), len(missing)
    finally:
        await client.close()

class MatchDiscoverer:
    def __init__(self, days: int = 10):
        self.days = days
        
    async def run(self):
        now = datetime.now(timezone.utc)
        start_date_obj = now - timedelta(days=self.days)
        start_date_str = start_date_obj.strftime("%Y-%m-%d")
        end_date_str = (now + timedelta(days=self.days-1)).strftime("%Y-%m-%d")

        logger.info(f"🚀 Starting Auto-Ingest from {self.days} days ago to {self.days} days future")

        await discovery_football(start_date_str, end_date_str)
        await discovery_basketball(start_date_obj, self.days)
        await discovery_tennis(start_date_obj, self.days)

        logger.info("🏁 Discovery and Ingestion completed.")

async def main():
    parser = argparse.ArgumentParser(description="BETIX Auto-Ingest Discovery")
    parser.add_argument("--days", type=int, default=10, help="Days to look backward and forward")
    args = parser.parse_args()
    
    discoverer = MatchDiscoverer(days=args.days)
    await discoverer.run()

if __name__ == "__main__":
    asyncio.run(main())
