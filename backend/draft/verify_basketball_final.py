
import asyncio
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST

async def verify_basketball():
    settings = get_settings()
    db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="analytics")
    
    # Reference match from 02/13 (470268)
    # Teams 892 and 888
    res = db.select_raw("basketball_team_rolling", "date=eq.2026-02-13&team_id=in.(892,888)")
    
    if not res:
        print("No data found in basketball_team_rolling for this match.")
        return

    print(f"--- Exhaustive verification of inserted data ({len(res)} rows) ---")
    for row in res:
        print(f"\nTeam: {row.get('team_id')} | Venue: {row.get('venue')}")
        for key, value in row.items():
            if value is None:
                print(f"  [NULL] {key}")
            else:
                print(f"  [OK]   {key}: {value}")

if __name__ == "__main__":
    asyncio.run(verify_basketball())
