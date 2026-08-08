import sys
import os
import asyncio

# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.services.ingestion.base_client import SupabaseREST
from app.config import get_settings
from datetime import datetime, timezone, timedelta

def fetch_all(db, table, select="*", filters=None):
    """Fetches all rows from a table, bypassing the 1000 row limit of PostgREST."""
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
        if not rows:
            break
        all_rows.extend(rows)
        if len(rows) < limit:
            break
        offset += limit
    return all_rows

async def main():
    print("🚀 Starting EXHAUSTIVE audit (Match by Match, no 1000-row limit)")
    
    settings = get_settings()
    db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="analytics")
    
    for sport in ["football", "basketball", "tennis"]:
        print(f"\n--- Analyzing {sport.upper()} ---")
        # 1. Fetch ALL finished matches (no 1000-row limit) AND within the last 10 days
        now = datetime.now(timezone.utc)
        ten_days_ago = (now - timedelta(days=10)).strftime("%Y-%m-%dT00:00:00Z")
        
        finished_matches = fetch_all(db, f"{sport}_matches", "id,api_id,date_time", {
            "status": "finished",
            "date_time": ("gte", ten_days_ago) # Filter on the last 10 days
        })
        print(f"Absolute total of Finished Matches in DB (since {ten_days_ago}): {len(finished_matches)}")
        
        if not finished_matches:
            continue
            
        # 2. Fetch ALL IDs present in the stats table
        stats_table = f"{sport}_match_stats"
        all_stats = fetch_all(db, stats_table, "match_id")
        
        # Unique IDs
        stats_match_ids = set([int(s["match_id"]) for s in all_stats if s.get("match_id")])
        print(f"Absolute total of Stats Rows: {len(all_stats)}")
        print(f"Unique Matches With Stats: {len(stats_match_ids)}")
        
        # 3. Exact match-by-match verification
        missing = []
        for m in finished_matches:
            # Football and Basketball use api_id as the foreign key
            # Tennis uses the internal id
            check_id = int(m["api_id"]) if sport != "tennis" else int(m["id"])
            if check_id not in stats_match_ids:
                missing.append((m["id"], check_id))
                
        print(f"❌ Result: {len(missing)} Finished matches are missing from stats!")
        if missing:
            print(f"   Example IDs (internal_id, foreign_key_id): {missing[:10]}" + ("..." if len(missing) > 10 else ""))

if __name__ == "__main__":
    asyncio.run(main())
