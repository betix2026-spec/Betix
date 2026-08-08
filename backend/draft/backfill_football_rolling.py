
import asyncio
import sys
import os
import logging

# Path setup for app imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST
from scripts.updates.update_match_rolling import SingleMatchRollingUpdater

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s - %(message)s")
logger = logging.getLogger("betix.backfill_rolling")

async def run_backfill():
    settings = get_settings()
    # Using the analytics schema
    db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="analytics")
    updater = SingleMatchRollingUpdater("football")
    
    date_cutoff = "2026-02-13T00:00:00"
    
    print(f"--- Starting Football Backfill from {date_cutoff} ---")
    
    # 1. Fetch finished matches since the cutoff (chronological)
    query = f"date_time=gte.{date_cutoff}&status=eq.finished&order=date_time.asc"
    matches = db.select_raw("football_matches", query)
    
    if not matches:
        print("No match found.")
        return

    report = {
        "total_matches": len(matches),
        "updated": [],
        "skipped_missing_stats": [],
        "skipped_already_exists": [],
        "errors": []
    }
    
    print(f"Matches to process: {len(matches)}")

    for m in matches:
        api_id = m.get("api_id")
        m_id = m.get("id")
        match_date = m.get("date_time")[:10]
        home_id = m.get("home_team_id")
        away_id = m.get("away_team_id")
        
        # A. Check whether stats are present (we expect 2 rows)
        stats = db.select_raw("football_match_stats", f"match_id=eq.{api_id}")
        if len(stats) < 2:
            print(f"Match {api_id}: Incomplete stats ({len(stats)}/2). Skip.")
            report["skipped_missing_stats"].append(api_id)
            continue
            
        # B. Check whether the rolling entry already exists for this match/date
        # We check the home team (if one is missing, we assume all 4 match entries need computing)
        existing = db.select_raw("football_team_rolling", f"team_id=eq.{home_id}&date=eq.{match_date}")
        if existing:
            # print(f"Match {api_id}: Rolling already present. Skip.")
            report["skipped_already_exists"].append(api_id)
            continue
            
        # C. Run the update
        try:
            print(f"Processing Match {api_id} ({match_date})...")
            await updater.update(api_id, dry_run=False)
            report["updated"].append(api_id)
        except Exception as e:
            print(f"Error on Match {api_id}: {e}")
            report["errors"].append({"id": api_id, "error": str(e)})

    # Final Report
    print("\n--- FOOTBALL BACKFILL FINAL REPORT ---")
    print(f"Total Matches listed      : {report['total_matches']}")
    print(f"Matches updated           : {len(report['updated'])}")
    print(f"Matches skipped (Missing stats)  : {len(report['skipped_missing_stats'])}")
    print(f"Matches skipped (Already present): {len(report['skipped_already_exists'])}")
    if report["errors"]:
        print(f"Errors encountered: {len(report['errors'])}")
        
    # Detailed list for the user
    # print("\nList of updated IDs:", report['updated'])

if __name__ == "__main__":
    asyncio.run(run_backfill())
