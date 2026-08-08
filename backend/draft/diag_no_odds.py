"""Quick diagnostic: check basketball matches with/without odds."""
import httpx, sys, os
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST

s = get_settings()
db = SupabaseREST(s.SUPABASE_URL, s.SUPABASE_SERVICE_ROLE_KEY, schema="analytics")

now = datetime.now(timezone.utc)
limit = now + timedelta(days=7)
now_str = now.strftime("%Y-%m-%dT%H:%M:%S") + "Z"
limit_str = limit.strftime("%Y-%m-%dT%H:%M:%S") + "Z"

rows = db.select_raw("basketball_matches",
    f"status=in.(imminent,scheduled)&date_time=gte.{now_str}&date_time=lte.{limit_str}&select=id,api_id,date_time&order=date_time.asc")

print(f"Total basketball matches: {len(rows)}\n")

headers = {"x-apisports-key": s.API_SPORTS_KEY}
with_odds = 0
without_odds = 0
without_list = []

# Test the first 15 and last 15 (near vs far)
sample = rows[:15] + rows[-15:] if len(rows) > 30 else rows

for m in sample:
    resp = httpx.get("https://v1.basketball.api-sports.io/odds",
                     headers=headers, params={"game": m["api_id"]}, timeout=15)
    data = resp.json().get("response", [])
    has = len(data) > 0
    dt = m["date_time"][:16]
    
    if has:
        with_odds += 1
        bks = data[0].get("bookmakers", [])
        b365 = next((b for b in bks if "bet365" in b["name"].lower()), None)
        status = f"✅ YES | {len(bks)} bookmakers | bet365={'YES' if b365 else 'NO'}"
    else:
        without_odds += 1
        without_list.append(m["api_id"])
        status = "❌ NO odds from API"
    
    print(f"  {m['api_id']} | {dt} | {status}")

print(f"\n{'='*60}")
print(f"  Sample: {with_odds} with odds / {without_odds} without odds")
if without_list:
    print(f"  IDs without odds: {without_list}")
print(f"{'='*60}")
