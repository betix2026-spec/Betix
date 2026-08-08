"""
BETIX — Prototype script: fetching Bet365 odds
Queries the 3 sports APIs to extract the target markets.

API response structure (validated via diagnostic):
- Football: response[0].bookmakers[].bets[].values[]
- Basketball: same (Bet365 absent → fallback Pinnacle/1xBet)
- Tennis: result{match_key: {market: {outcome: {bookmaker: odd}}}}
"""
import asyncio
import httpx
import json
import sys
import os
from datetime import datetime, timedelta

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from app.config import get_settings

# ─── Configuration ─────────────────────────────────────────────
FOOTBALL_FIXTURE_ID = 1379229       # Match with confirmed Bet365 odds
BASKETBALL_GAME_ID = 470281        # NBA match with confirmed odds
TENNIS_MATCH_KEY = 12104660        # Singles tennis match with Bet365 odds

PREFERRED_BOOKIE_NAME = "Bet365"
PREFERRED_BOOKIE_ID = 8            # Football only

# Fallback bookmakers for basketball (Bet365 unavailable)
BASKETBALL_FALLBACK = ["Pinnacle", "1xBet", "Betfair"]

# 8 target Football markets
FOOTBALL_MARKETS = [
    "Match Winner",         # 1x2
    "Goals Over/Under",     # Totals
    "Both Teams Score",     # BTTS
    "Double Chance",
    "Exact Score",          # Correct Score (actual API name)
    "Asian Handicap",
    "HT/FT Double",        # Half Time / Full Time (actual API name)
    "First Half Winner"
]

# 5 target Basketball markets
BASKETBALL_MARKETS = [
    "Home/Away",            # Moneyline (incl OT)
    "Asian Handicap",       # Spread
    "Over/Under",           # Game Totals
    "Over/Under 1st Half",  # 1st Half Totals
    "Home/Away - 1st Half"  # 1st Half Winner
]

# 5 target Tennis markets (exact names from the API)
TENNIS_MARKETS = [
    "Home/Away",            # Match Winner
    "Set Betting",          # Score in Sets
    "Over/Under",           # Total Games (special structure)
    "Home/Away (1st Set)",  # 1st Set Winner
    "Correct Score 1st Half"# Exact score 1st set
]


class OddsPrototype:
    def __init__(self):
        s = get_settings()
        self.api_sports_key = s.API_SPORTS_KEY
        self.api_tennis_key = s.API_TENNIS_KEY

    # ─── Football ─────────────────────────────────────────────
    async def fetch_football(self, client: httpx.AsyncClient) -> dict:
        """Fetches Football odds via API-Sports v3."""
        print("\n🏟️  FOOTBALL — Fetching odds...")
        headers = {"x-apisports-key": self.api_sports_key}
        resp = await client.get(
            "https://v3.football.api-sports.io/odds",
            headers=headers,
            params={"fixture": FOOTBALL_FIXTURE_ID, "bookmaker": PREFERRED_BOOKIE_ID}
        )
        resp.raise_for_status()
        data = resp.json().get("response", [])
        
        if not data:
            print("   ❌ No data returned")
            return {}
        
        bookmakers = data[0].get("bookmakers", [])
        if not bookmakers:
            print("   ❌ No bookmakers found")
            return {}
        
        bookie = bookmakers[0]
        bets = bookie.get("bets", [])
        
        result = {}
        for target_market in FOOTBALL_MARKETS:
            market_data = next((b for b in bets if b["name"] == target_market), None)
            if market_data:
                values = market_data.get("values", [])
                result[target_market] = [
                    {"label": str(v["value"]), "odds": float(v["odd"])} 
                    for v in values
                ]
            else:
                result[target_market] = None
        
        return result

    # ─── Basketball ───────────────────────────────────────────
    async def fetch_basketball(self, client: httpx.AsyncClient) -> dict:
        """Fetches Basketball odds via API-Sports v1.
        Bet365 is unavailable → falls back to another bookmaker."""
        print("\n🏀 BASKETBALL — Fetching odds...")
        headers = {"x-apisports-key": self.api_sports_key}
        resp = await client.get(
            "https://v1.basketball.api-sports.io/odds",
            headers=headers,
            params={"game": BASKETBALL_GAME_ID}
        )
        resp.raise_for_status()
        data = resp.json().get("response", [])
        
        if not data:
            print("   ❌ No data returned")
            return {}
        
        bookmakers = data[0].get("bookmakers", [])
        
        # Look for Bet365 first, then fallback
        bookie = None
        for name in [PREFERRED_BOOKIE_NAME] + BASKETBALL_FALLBACK:
            bookie = next(
                (b for b in bookmakers if name.lower() in b["name"].lower()), 
                None
            )
            if bookie:
                break
        
        if not bookie:
            print("   ❌ No suitable bookmaker found")
            return {}
        
        print(f"   📌 Using bookmaker: {bookie['name']}")
        bets = bookie.get("bets", [])
        
        result = {}
        for target_market in BASKETBALL_MARKETS:
            market_data = next((b for b in bets if b["name"] == target_market), None)
            if market_data:
                values = market_data.get("values", [])
                result[target_market] = [
                    {"label": str(v["value"]), "odds": float(v["odd"])} 
                    for v in values
                ]
            else:
                result[target_market] = None
        
        return result

    # ─── Tennis ───────────────────────────────────────────────
    async def fetch_tennis(self, client: httpx.AsyncClient) -> dict:
        """Fetches Tennis odds via API-Tennis.
        Different structure: result[match_key][market][outcome][bookmaker] = odd
        """
        print("\n🎾 TENNIS — Fetching odds...")
        today = datetime.now().strftime("%Y-%m-%d")
        tomorrow = (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%d")
        
        resp = await client.get(
            "https://api.api-tennis.com/tennis/",
            params={
                "method": "get_odds",
                "date_start": today,
                "date_stop": tomorrow,
                "APIkey": self.api_tennis_key
            }
        )
        resp.raise_for_status()
        data = resp.json()
        all_matches = data.get("result", {})
        
        match_key = str(TENNIS_MATCH_KEY)
        if match_key not in all_matches:
            # If the exact match isn't found, take the first one available
            if all_matches:
                match_key = list(all_matches.keys())[0]
                print(f"   ⚠️ Match {TENNIS_MATCH_KEY} not found, falling back to {match_key}")
            else:
                print("   ❌ No matches with odds available")
                return {}
        
        match_odds = all_matches[match_key]
        
        result = {}
        for target_market in TENNIS_MARKETS:
            market_data = match_odds.get(target_market)
            if not market_data or not isinstance(market_data, dict):
                result[target_market] = None
                continue
            
            # Extract the bet365 odd for each outcome
            values = []
            for outcome_name, bookies_or_thresholds in market_data.items():
                if not isinstance(bookies_or_thresholds, dict):
                    continue
                
                # Determine whether this is a bookmaker dict ({"bet365": "1.50"})
                # or a threshold dict ({"2.5": {"bet365": "1.50"}})
                first_val = next(iter(bookies_or_thresholds.values()), None)
                
                if isinstance(first_val, dict):
                    # 3-level structure: outcome → threshold → bookmaker → odd
                    # E.g.: "Over/Under Over" → {"2.5": {"bwin": "1.50", "bet365": "1.55"}}
                    for threshold, bookies in bookies_or_thresholds.items():
                        if isinstance(bookies, dict):
                            odd = bookies.get("bet365")
                            if odd is None:
                                odd = next(iter(bookies.values()), None)
                            if odd:
                                label = f"{outcome_name} {threshold}"
                                values.append({"label": label, "odds": float(odd)})
                else:
                    # 2-level structure: outcome → bookmaker → odd
                    # E.g.: "Home" → {"bet365": "2.50", "bwin": "2.40"}
                    odd = bookies_or_thresholds.get("bet365")
                    if odd is None:
                        odd = next(iter(bookies_or_thresholds.values()), None)
                    if odd:
                        try:
                            values.append({"label": outcome_name, "odds": float(odd)})
                        except (ValueError, TypeError):
                            pass
            
            result[target_market] = values if values else None
        
        return result

    # ─── Runner ───────────────────────────────────────────────
    async def run(self):
        print("="*60)
        print("  BETIX — Prototype Odds Fetcher (Bet365)")
        print("="*60)
        
        results = {}
        async with httpx.AsyncClient(timeout=30.0) as client:
            results["football"] = await self.fetch_football(client)
            await asyncio.sleep(1)
            results["basketball"] = await self.fetch_basketball(client)
            await asyncio.sleep(1)
            results["tennis"] = await self.fetch_tennis(client)
        
        # ── Report ──
        print("\n" + "="*60)
        print("  📊 EXTRACTION REPORT")
        print("="*60)
        
        sport_configs = {
            "football": ("🏟️", FOOTBALL_MARKETS),
            "basketball": ("🏀", BASKETBALL_MARKETS),
            "tennis": ("🎾", TENNIS_MARKETS),
        }
        
        for sport, (icon, expected) in sport_configs.items():
            data = results.get(sport, {})
            found = sum(1 for m in expected if data.get(m) is not None)
            print(f"\n{icon} {sport.upper()} — {found}/{len(expected)} markets")
            
            for market in expected:
                odds = data.get(market)
                if odds is None:
                    print(f"   ⭕ {market}: NOT FOUND")
                else:
                    preview = " | ".join(f"{o['label']}={o['odds']}" for o in odds[:4])
                    if len(odds) > 4:
                        preview += f" ... (+{len(odds)-4})"
                    print(f"   ✅ {market}: {preview}")


if __name__ == "__main__":
    proto = OddsPrototype()
    asyncio.run(proto.run())
