
import asyncio
import sys
import os

# Path setup for importing app modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST

async def check_match():
    settings = get_settings()
    # Working in the analytics schema
    db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="analytics")
    
    date_start = "2026-02-13T00:00:00"
    
    print(f"--- Searching for the oldest basketball match since {date_start} ---")
    
    # 1. Fetch the oldest match starting from 02/13
    query = f"date_time=gte.{date_start}&status=eq.finished&order=date_time.asc&limit=1"
    matches = db.select_raw("basketball_matches", query)
    
    if not matches:
        print("No match found from this date onward.")
        return

    match = matches[0]
    m_id = match.get("id")
    m_api_id = match.get("api_id")
    home_id = match.get("home_team_id")
    away_id = match.get("away_team_id")
    dt = match.get("date_time")
    
    print(f"Match found:")
    print(f"  - Internal ID : {m_id}")
    print(f"  - API ID      : {m_api_id}")
    print(f"  - Date/Time   : {dt}")
    print(f"  - Home Team ID (internal) : {home_id}")
    print(f"  - Away Team ID (internal) : {away_id}")
    
    # 2. Check the stats in basketball_match_stats
    print(f"\n--- Checking basketball_match_stats for match_id {m_api_id} ---")
    stats_query = f"match_id=eq.{m_api_id}"
    stats = db.select_raw("basketball_match_stats", stats_query)
    
    if not stats:
        print("--- NO stats found in basketball_match_stats for this match.")
    else:
        print(f"--- {len(stats)} stats row(s) found.")
        for s in stats:
            team_id = s.get("team_id")
            print(f"  - Row for Team ID: {team_id}")
        
        if len(stats) == 2:
            print("\nConclusion: The basketball_match_stats table is complete for this match (2 rows).")
        else:
            print(f"\nConclusion: Table incomplete ({len(stats)}/2 rows).")

if __name__ == "__main__":
    asyncio.run(check_match())
