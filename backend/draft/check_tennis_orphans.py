import sys
import os
import asyncio
import httpx

# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.services.ingestion.base_client import SupabaseREST
from app.config import get_settings

def fetch_all(db, table, select="*", filters=None):
    all_rows = []
    offset = 0
    limit = 1000
    while True:
        params = [f"select={select}", f"limit={limit}", f"offset={offset}"]
        if filters:
            for k, v in filters.items():
                if isinstance(v, tuple) and len(v) == 2:
                    op, val = v
                    params.append(f"{k}={op}.{val}")
                else:
                    params.append(f"{k}=eq.{v}")
        query = "&".join(params)
        rows = db.select_raw(table, query)
        if not rows: break
        all_rows.extend(rows)
        if len(rows) < limit: break
        offset += limit
    return all_rows

async def main():
    settings = get_settings()
    db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="analytics")
    
    # 1. Fetch finished tennis matches
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    ten_days_ago = (now - timedelta(days=10)).strftime("%Y-%m-%dT00:00:00Z")
    
    finished_matches = fetch_all(db, "tennis_matches", "id,api_id,date_time", {
        "status": "finished",
        "date_time": ("gte", ten_days_ago)
    })
    
    all_stats = fetch_all(db, "tennis_match_stats", "match_id")
    stats_ids = set([int(s["match_id"]) for s in all_stats if s.get("match_id")])
    
    missing_api_ids = []
    for m in finished_matches:
        if m["id"] not in stats_ids:
            missing_api_ids.append((m["id"], m["api_id"], m["date_time"]))
            
    print(f"Tennis matches missing stats: {len(missing_api_ids)}")
    if not missing_api_ids:
        return
        
    print("Checking first 3 from API-Tennis directly...")
    
    for _, api_id, date_time in missing_api_ids[:3]:
        date_str = date_time[:10]
        params = {
            "method": "get_fixtures",
            "APIkey": settings.API_TENNIS_KEY,
            "event_id": str(api_id),
            "date_start": date_str,
            "date_stop": date_str
        }
        with httpx.Client(timeout=15.0) as client:
            resp = client.get(settings.API_TENNIS_BASE_URL, params=params)
            data = resp.json()
            results = data.get("result", [])
            if not results:
                print(f"API_ID {api_id}: No result from API")
                continue
            fix = results[0]
            stats = fix.get("statistics", [])
            print(f"API_ID {api_id}: Got {len(stats)} stats items from API.")
            if not stats:
                print(f"   -> This match legitimately has no stats published by the API.")

if __name__ == "__main__":
    asyncio.run(main())
