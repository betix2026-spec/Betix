"""
BETIX — check_injuries_api.py
Smoke-test for the new injury fetch in data_aggregation.py's
DataAggregator.fetch_injuries() — this is the first time this codebase has
ever called API-Football's /injuries endpoint, and its exact response shape
isn't verified anywhere in this repo (only general API-Football docs
knowledge). Run this against a REAL upcoming football fixture before
trusting it in production: prints the raw API response first (so you can
see the actual field names), then the parsed {"home": [...], "away": [...]}
result our code would produce.

Usage:
    python draft/check_injuries_api.py <football_match_id>

Find a football_match_id with e.g.:
    python draft/check_odds_and_audit.py --sport football --match-id <id>
or query analytics.football_matches for an upcoming id directly.
"""
import sys
import os
import json
import asyncio

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app.engine.data_aggregation import DataAggregator


async def main():
    if len(sys.argv) < 2:
        print("Usage: python draft/check_injuries_api.py <football_match_id>")
        sys.exit(1)
    match_id = int(sys.argv[1])

    agg = DataAggregator()

    match_rows = agg.db.select("football_matches", "api_id,home_team_id,away_team_id", {"id": match_id})
    if not match_rows:
        print(f"No football_matches row with id={match_id}")
        sys.exit(1)
    fixture_api_id = match_rows[0]["api_id"]
    print(f"football_matches.id={match_id} -> api_id (fixture)={fixture_api_id}\n")

    import httpx
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{agg.settings.API_FOOTBALL_BASE_URL}/injuries",
            headers={"x-apisports-key": agg.settings.API_SPORTS_KEY},
            params={"fixture": fixture_api_id},
        )
        print(f"HTTP {resp.status_code}")
        data = resp.json()

    print("=" * 60)
    print("  RAW API RESPONSE (first 3 entries)")
    print("=" * 60)
    print(json.dumps(data.get("response", [])[:3], indent=2))
    print(f"\n  ... {len(data.get('response', []))} total entries")
    if data.get("errors"):
        print(f"\n  ⚠️ API errors field: {data.get('errors')}")

    print("\n" + "=" * 60)
    print("  PARSED (what fetch_injuries() actually returns)")
    print("=" * 60)
    parsed = await agg.fetch_injuries("football", match_id)
    print(json.dumps(parsed, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
