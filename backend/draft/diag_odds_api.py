"""
Diagnostic Part 4:
- Basketball: list ALL available bookmakers for game=470281
- Tennis: find a SIMPLE match with odds
"""
import httpx
import json
import sys
import os
from datetime import datetime, timedelta

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from app.config import get_settings

s = get_settings()
KEY = s.API_SPORTS_KEY
TENNIS_KEY = s.API_TENNIS_KEY
H = {"x-apisports-key": KEY}

def section(title):
    print(f"\n{'='*60}\n  {title}\n{'='*60}")

# ==============================================================
# 1. BASKETBALL: All bookmakers for game=470281
# ==============================================================
section("BASKETBALL — All bookmakers for game=470281")
try:
    r = httpx.get("https://v1.basketball.api-sports.io/odds",
        headers=H,
        params={"game": "470281"},
        timeout=30)
    d = r.json()
    resp = d.get("response", [])
    if resp:
        bookmakers = resp[0].get("bookmakers", [])
        print(f"  Total bookmakers: {len(bookmakers)}")
        for bk in bookmakers:
            markets = [b['name'] for b in bk.get("bets", [])]
            print(f"  id={bk['id']:3d} | {bk['name']} ({len(markets)} markets): {markets}")
    else:
        print(f"  No data. Results: {d.get('results')}")
except Exception as e:
    print(f"  ERROR: {e}")

# ==============================================================
# 2. TENNIS: get_odds with date_start/date_stop
# ==============================================================
section("TENNIS — get_odds with dates")
try:
    today = datetime.now().strftime("%Y-%m-%d")
    tomorrow = (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%d")
    
    r2 = httpx.get("https://api.api-tennis.com/tennis/",
        params={
            "method": "get_odds",
            "date_start": today,
            "date_stop": tomorrow,
            "APIkey": TENNIS_KEY
        },
        timeout=15)
    d2 = r2.json()
    result = d2.get("result", {})
    print(f"  Success: {d2.get('success')}")
    
    if isinstance(result, dict) and result:
        keys = list(result.keys())
        print(f"  Total matches with odds: {len(keys)}")
        # Print the first match in detail
        first_key = keys[0]
        first_data = result[first_key]
        print(f"\n  Sample match_key: {first_key}")
        if isinstance(first_data, dict):
            for market_name in list(first_data.keys()):
                print(f"    Market: {market_name}")
                outcomes = first_data[market_name]
                if isinstance(outcomes, dict):
                    for oc_name, bookies in list(outcomes.items())[:2]:
                        if isinstance(bookies, dict):
                            has_b365 = "bet365" in bookies
                            print(f"      {oc_name}: bookmakers={list(bookies.keys())[:5]} | bet365={'✅' if has_b365 else '❌'}")
    elif isinstance(result, list):
        print(f"  Result is list: {len(result)} items")
        if result:
            print(json.dumps(result[:2], indent=2)[:600])
    else:
        print(f"  Empty or unexpected: {str(result)[:300]}")
        
except Exception as e:
    print(f"  ERROR: {e}")

print("\n✅ Part 4 diagnostic complete.")
