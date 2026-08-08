"""Targeted test of multi-market fetch_odds — without asyncio.gather."""
import asyncio, sys, os, json
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST
from app.engine.data_aggregation import DataAggregator

async def main():
    agg = DataAggregator()
    
    # Find a match with odds
    sample = agg.db.select_raw("odds_snapshots", "select=match_id,sport&limit=1")
    if not sample:
        print("❌ No snapshot in the DB")
        return
    
    mid = sample[0]["match_id"]
    sp = sample[0]["sport"]
    print(f"🎯 Testing fetch_odds for {sp} #{mid}\n")
    
    # Direct test of fetch_odds
    odds = await agg.fetch_odds(sp, mid)
    
    if odds is None:
        print("❌ ERROR: odds is None")
        return
        
    print(f"✅ {len(odds)} markets fetched:")
    for mk, data in odds.items():
        od = data["odds_data"]
        preview = json.dumps(od, ensure_ascii=False)[:120] if isinstance(od, (list, dict)) else str(od)[:120]
        print(f"   📊 {mk}: {preview}")
    
    print(f"\n🔍 Full detail of the first market:")
    first_mk = list(odds.keys())[0]
    print(json.dumps(odds[first_mk], indent=2, ensure_ascii=False, default=str))

asyncio.run(main())
