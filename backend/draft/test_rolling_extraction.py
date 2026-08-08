import asyncio
import json
import logging
import sys
import os
from typing import Dict, Any

# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.engine.data_aggregation import get_match_context

# Defining the function locally to avoid importing match_audit_script.py (which crashes due to the AI)
def filter_essential_stats_local(sport: str, context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Filters the context to keep only the 'core' statistics
    to lighten the JSON archive while preserving the audit's substance.
    """
    filtered = {
        "home": {},
        "away": {}
    }
    
    # Mapping of key stats by sport
    keys_by_sport = {
        "basketball": ["l5_ortg", "l5_drtg", "l5_net_rtg", "l5_pace", "l5_efg_pct", "l10_ortg", "l10_drtg"],
        "football": ["l5_goals_for", "l5_goals_against", "l5_xg_for", "l5_xg_against", "l5_possession_avg", "l5_points"],
        "tennis": ["l10_aces_avg", "l10_first_serve_pct", "l10_first_serve_won", "l10_bp_saved_pct", "l10_return_won_pct", "l10_bp_converted_pct"]
    }
    
    keys = keys_by_sport.get(sport, [])
    
    # Fetch the "global" (all venues) latest rolling snapshot
    for side in ["home", "away"]:
        # For basketball/football: "home_team" / "away_team"
        # For tennis: "player1" / "player2"
        side_key = f"{side}_team" if sport != "tennis" else ("player1" if side == "home" else "player2")
        
        raw_form = context.get(side_key, {}).get("form", {}).get("global", [])
        if not raw_form and sport == "tennis":
            # Tennis has a slightly different structure in the aggregator
            raw_form = context.get(side_key, {}).get("form", {}).get("overall", [])
            
        if raw_form:
            latest = raw_form[0] # Most recent (index 0 since sorted by date desc in the aggregator)
            filtered[side] = {k: latest.get(k) for k in keys if k in latest}
            filtered[side]["date"] = latest.get("date")

    return filtered

async def test_sport_extraction(sport, match_id):
    print(f"\n" + "="*50)
    print(f" TESTING {sport.upper()} Match #{match_id}")
    print("="*50)
    
    # 1. Fetch the context
    try:
        context = await get_match_context(sport, match_id)
    except Exception as e:
        print(f"[ERROR] Error in get_match_context: {e}")
        return

    if not context or not context.get("match"):
        print(f"[ERROR] No context found for {sport} #{match_id}")
        return

    # 2. Extract the filtered stats
    filtered = filter_essential_stats_local(sport, context)
    
    # 3. Print the results
    print("\n[FILTERED RESULTS STORED IN AI_MATCH_AUDITS]")
    print(json.dumps(filtered, indent=2))
    
    # 4. In-depth diagnostic
    keys_by_sport = {
        "basketball": ["l5_ortg", "l5_drtg", "l5_net_rtg", "l5_pace", "l5_efg_pct", "l10_ortg", "l10_drtg"],
        "football": ["l5_goals_for", "l5_goals_against", "l5_xg_for", "l5_xg_against", "l5_possession_avg", "l5_points"],
        "tennis": ["l10_aces_avg", "l10_first_serve_pct", "l10_first_serve_won", "l10_bp_saved_pct", "l10_return_won_pct", "l10_bp_converted_pct"]
    }
    expected_keys = keys_by_sport.get(sport, [])

    for side in ["home", "away"]:
        side_key = f"{side}_team" if sport != "tennis" else ("player1" if side == "home" else "player2")
        form_dict = context.get(side_key, {}).get("form", {})
        
        print(f"\n--- Details {side_key} ---")
        if not form_dict:
            print(f"WARN: No 'form' dictionary for {side_key}")
            continue

        for fkey in ["global", "overall", "home", "away"]:
            data = form_dict.get(fkey, [])
            if data:
                print(f"Form '{fkey}': {len(data)} snapshots found. Latest on {data[0].get('date')}")
                # Check for the expected keys in this category's latest snapshot
                missing = [k for k in expected_keys if k not in data[0]]
                if missing:
                    print(f"   MISSING: MISSING keys in '{fkey}': {missing}")
                else:
                    print(f"   OK: All keys ({len(expected_keys)}) are present in '{fkey}'.")
            else:
                print(f"   (The '{fkey}' entry is empty)")

async def main():
    # List of matches to test (valid internal IDs found in the DB)
    tests = [
        ("football", 1321),
        ("basketball", 4385),
        ("tennis", 3076)
    ]
    
    for sport, mid in tests:
        await test_sport_extraction(sport, mid)

if __name__ == "__main__":
    asyncio.run(main())
