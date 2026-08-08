"""
BETIX — Ingestion test: inserts the odds for the 3 test matches into analytics.odds_snapshots.
Bulk mode: 1 snapshot = 1 market (all lines in odds_data).

Target matches:
- Football fixture=1379229 (8 Bet365 markets)
- Basketball game=470281 (5 Bet365 markets)
- Tennis match_key=12104660 (5 bet365 markets)
"""
import asyncio
import httpx
import json
import sys
import os
import logging
from datetime import datetime, timedelta

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s — %(message)s")
logger = logging.getLogger("betix.test_ingest_odds")

# ─── Configuration ─────────────────────────────────────────────
FOOTBALL_FIXTURE_ID = 1379229
BASKETBALL_GAME_ID = 470281
TENNIS_MATCH_KEY = 12104660

PREFERRED_BOOKIE_NAME = "Bet365"
PREFERRED_BOOKIE_ID = 8
BASKETBALL_FALLBACK = ["Pinnacle", "1xBet", "Betfair"]

FOOTBALL_MARKETS = [
    "Match Winner", "Goals Over/Under", "Both Teams Score",
    "Double Chance", "Exact Score", "Asian Handicap",
    "HT/FT Double", "First Half Winner"
]

BASKETBALL_MARKETS = [
    "Home/Away", "Asian Handicap", "Over/Under",
    "Over/Under 1st Half", "Home/Away - 1st Half"
]

TENNIS_MARKETS = [
    "Home/Away", "Set Betting", "Over/Under",
    "Home/Away (1st Set)", "Correct Score 1st Half"
]


def build_snapshot(match_id: int, sport: str, bookmaker: str,
                   market_name: str, odds_data: list) -> dict:
    """Builds a dict ready for insertion into analytics.odds_snapshots."""
    return {
        "match_id": match_id,
        "sport": sport,
        "bookmaker": bookmaker,
        "market_name": market_name,
        "odds_data": json.dumps(odds_data)
    }


async def fetch_football(client: httpx.AsyncClient, api_key: str) -> list:
    """Fetches Football Bet365 odds."""
    logger.info("🏟️  Football — Fetching odds...")
    resp = await client.get(
        "https://v3.football.api-sports.io/odds",
        headers={"x-apisports-key": api_key},
        params={"fixture": FOOTBALL_FIXTURE_ID, "bookmaker": PREFERRED_BOOKIE_ID}
    )
    resp.raise_for_status()
    data = resp.json().get("response", [])
    if not data:
        logger.warning("   ❌ No data")
        return []

    bookie = data[0].get("bookmakers", [{}])[0]
    bets = bookie.get("bets", [])
    
    snapshots = []
    for market in FOOTBALL_MARKETS:
        bet = next((b for b in bets if b["name"] == market), None)
        if bet:
            odds = [{"label": str(v["value"]), "odds": float(v["odd"])} for v in bet.get("values", [])]
            snapshots.append(build_snapshot(FOOTBALL_FIXTURE_ID, "football", PREFERRED_BOOKIE_NAME, market, odds))
    
    logger.info(f"   ✅ {len(snapshots)} markets extracted")
    return snapshots


async def fetch_basketball(client: httpx.AsyncClient, api_key: str) -> list:
    """Fetches Basketball odds (Bet365 or fallback)."""
    logger.info("🏀 Basketball — Fetching odds...")
    resp = await client.get(
        "https://v1.basketball.api-sports.io/odds",
        headers={"x-apisports-key": api_key},
        params={"game": BASKETBALL_GAME_ID}
    )
    resp.raise_for_status()
    data = resp.json().get("response", [])
    if not data:
        logger.warning("   ❌ No data")
        return []

    bookmakers = data[0].get("bookmakers", [])
    bookie = None
    for name in [PREFERRED_BOOKIE_NAME] + BASKETBALL_FALLBACK:
        bookie = next((b for b in bookmakers if name.lower() in b["name"].lower()), None)
        if bookie:
            break
    
    if not bookie:
        logger.warning("   ❌ No suitable bookmaker")
        return []

    bookie_name = bookie["name"]
    logger.info(f"   📌 Using: {bookie_name}")
    bets = bookie.get("bets", [])

    snapshots = []
    for market in BASKETBALL_MARKETS:
        bet = next((b for b in bets if b["name"] == market), None)
        if bet:
            odds = [{"label": str(v["value"]), "odds": float(v["odd"])} for v in bet.get("values", [])]
            snapshots.append(build_snapshot(BASKETBALL_GAME_ID, "basketball", bookie_name, market, odds))
    
    logger.info(f"   ✅ {len(snapshots)} markets extracted")
    return snapshots


async def fetch_tennis(client: httpx.AsyncClient, tennis_key: str) -> list:
    """Fetches Tennis bet365 odds (nested dict structure)."""
    logger.info("🎾 Tennis — Fetching odds...")
    today = datetime.now().strftime("%Y-%m-%d")
    stop = (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%d")
    
    resp = await client.get(
        "https://api.api-tennis.com/tennis/",
        params={"method": "get_odds", "date_start": today, "date_stop": stop, "APIkey": tennis_key}
    )
    resp.raise_for_status()
    all_matches = resp.json().get("result", {})
    
    match_key = str(TENNIS_MATCH_KEY)
    if match_key not in all_matches:
        if all_matches:
            match_key = list(all_matches.keys())[0]
            logger.info(f"   ⚠️ Match {TENNIS_MATCH_KEY} not found, fallback: {match_key}")
        else:
            logger.warning("   ❌ No odds data")
            return []
    
    match_odds = all_matches[match_key]
    used_match_id = int(match_key)
    
    snapshots = []
    for market in TENNIS_MARKETS:
        market_data = match_odds.get(market)
        if not market_data or not isinstance(market_data, dict):
            continue
        
        values = []
        for outcome_name, bookies_or_thresholds in market_data.items():
            if not isinstance(bookies_or_thresholds, dict):
                continue
            
            first_val = next(iter(bookies_or_thresholds.values()), None)
            
            if isinstance(first_val, dict):
                # 3 levels: outcome → threshold → bookmaker → odd
                for threshold, bookies in bookies_or_thresholds.items():
                    if isinstance(bookies, dict):
                        odd = bookies.get("bet365") or next(iter(bookies.values()), None)
                        if odd:
                            values.append({"label": f"{outcome_name} {threshold}", "odds": float(odd)})
            else:
                # 2 levels: outcome → bookmaker → odd
                odd = bookies_or_thresholds.get("bet365") or next(iter(bookies_or_thresholds.values()), None)
                if odd:
                    try:
                        values.append({"label": outcome_name, "odds": float(odd)})
                    except (ValueError, TypeError):
                        pass
        
        if values:
            snapshots.append(build_snapshot(used_match_id, "tennis", "bet365", market, values))
    
    logger.info(f"   ✅ {len(snapshots)} markets extracted (match_key={match_key})")
    return snapshots


async def main():
    settings = get_settings()
    db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="analytics")
    
    logger.info("=" * 60)
    logger.info("  BETIX — Odds Ingestion Test (Bulk Mode)")
    logger.info("=" * 60)
    
    # Full table cleanup
    logger.info("🧹 Cleaning the odds_snapshots table...")
    try:
        for mid in [FOOTBALL_FIXTURE_ID, BASKETBALL_GAME_ID, TENNIS_MATCH_KEY]:
            db.delete("odds_snapshots", {"match_id": str(mid)})
        logger.info("   ✅ Cleanup OK")
    except Exception as e:
        logger.warning(f"   ⚠️ Partial cleanup: {e}")
    
    all_snapshots = []
    async with httpx.AsyncClient(timeout=30.0) as client:
        fb = await fetch_football(client, settings.API_SPORTS_KEY)
        all_snapshots.extend(fb)
        await asyncio.sleep(1)
        
        bb = await fetch_basketball(client, settings.API_SPORTS_KEY)
        all_snapshots.extend(bb)
        await asyncio.sleep(1)
        
        te = await fetch_tennis(client, settings.API_TENNIS_KEY)
        all_snapshots.extend(te)
    
    logger.info(f"\n📦 Total snapshots to insert: {len(all_snapshots)}")
    
    if not all_snapshots:
        logger.warning("⚠️ No snapshots — aborting.")
        return
    
    # DB insertion
    try:
        headers = {**db.headers, "Prefer": "return=representation"}
        url = f"{db.base_url}/odds_snapshots"
        resp = httpx.post(url, headers=headers, json=all_snapshots, timeout=30.0)
        resp.raise_for_status()
        inserted = resp.json()
        
        logger.info(f"\n✅ {len(inserted)} snapshots inserted successfully!")
        
        # Summary by sport
        sports = {}
        for s in inserted:
            sp = s.get("sport", "?")
            if sp not in sports:
                sports[sp] = {"count": 0, "markets": []}
            sports[sp]["count"] += 1
            sports[sp]["markets"].append(s.get("market_name"))
        
        for sport, info in sports.items():
            logger.info(f"  {sport}: {info['count']} markets → {info['markets']}")
            
    except httpx.HTTPStatusError as e:
        logger.error(f"❌ DB insertion error: {e.response.status_code}")
        logger.error(f"   Body: {e.response.text}")
    except Exception as e:
        logger.error(f"❌ Unexpected error: {e}")


if __name__ == "__main__":
    asyncio.run(main())
