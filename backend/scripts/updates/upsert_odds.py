"""
BETIX — Global odds ingestion (7-day window, excludes live matches).

Fetches Bet365 odds for ALL upcoming matches across the 3 sports
and inserts them into analytics.odds_snapshots (bulk mode: 1 row = 1 market).

Optimizations:
- Football/Basketball: 1 API call per match (bookmaker=8 to limit the payload)
- Tennis: a single API call returns all matches for the period
- Delay between each request to respect API quotas (300 req/min)
"""
import asyncio
import httpx
import json
import sys
import os
import logging
from datetime import datetime, timedelta, timezone
from collections import defaultdict

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s — %(message)s")
logger = logging.getLogger("betix.upsert_odds")

# ─── Configuration ─────────────────────────────────────────────
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

WINDOW_DAYS = 7


def build_snapshot(match_id: int, sport: str, bookmaker: str,
                   market_name: str, odds_data: list) -> dict:
    return {
        "match_id": match_id,
        "sport": sport,
        "bookmaker": bookmaker,
        "market_name": market_name,
        "odds_data": json.dumps(odds_data)
    }


class OddsIngester:
    def __init__(self):
        settings = get_settings()
        # Everything lives in the analytics schema (matches + odds)
        self.db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="analytics")
        self.api_sports_key = settings.API_SPORTS_KEY
        self.api_tennis_key = settings.API_TENNIS_KEY
        
        # Counters for the report
        self.report = {
            "football":   {"matches_found": 0, "matches_with_odds": 0, "snapshots": 0},
            "basketball": {"matches_found": 0, "matches_with_odds": 0, "snapshots": 0},
            "tennis":     {"matches_found": 0, "matches_with_odds": 0, "snapshots": 0},
        }

    # ─── Fetching upcoming matches ───────────────────────────
    def get_upcoming_matches(self, sport: str) -> list:
        now = datetime.now(timezone.utc)
        limit = now + timedelta(days=WINDOW_DAYS)
        now_str = now.strftime("%Y-%m-%dT%H:%M:%S") + "Z"
        limit_str = limit.strftime("%Y-%m-%dT%H:%M:%S") + "Z"
        
        table = f"{sport}_matches"
        query = (
            f"status=in.(imminent,scheduled)"
            f"&date_time=gte.{now_str}"
            f"&date_time=lte.{limit_str}"
            f"&select=id,api_id,date_time"
            f"&order=date_time.asc"
        )
        
        try:
            rows = self.db.select_raw(table, query)
            self.report[sport]["matches_found"] = len(rows)
            return rows
        except Exception as e:
            logger.error(f"❌ Error fetching {sport} matches: {e}")
            return []

    # ─── Football/Basketball: 1 API call per match ──────────────
    async def fetch_fb_bb_odds(self, client: httpx.AsyncClient, sport: str, match: dict) -> list:
        api_id = match["api_id"]
        db_id = match["id"]
        
        url = "https://v3.football.api-sports.io/odds" if sport == "football" else "https://v1.basketball.api-sports.io/odds"
        param_key = "fixture" if sport == "football" else "game"
        markets = FOOTBALL_MARKETS if sport == "football" else BASKETBALL_MARKETS
        
        headers = {"x-apisports-key": self.api_sports_key}
        params = {param_key: api_id}
        
        # For football we filter directly for Bet365 on the API side
        if sport == "football":
            params["bookmaker"] = PREFERRED_BOOKIE_ID
        
        try:
            resp = await client.get(url, headers=headers, params=params)
            resp.raise_for_status()
            data = resp.json().get("response", [])
            if not data:
                return []
            
            bookmakers_list = data[0].get("bookmakers", [])
            if not bookmakers_list:
                return []
            
            # Find the bookmaker
            if sport == "football":
                bookie = bookmakers_list[0]
            else:
                bookie = None
                for name in [PREFERRED_BOOKIE_NAME] + BASKETBALL_FALLBACK:
                    bookie = next((b for b in bookmakers_list if name.lower() in b["name"].lower()), None)
                    if bookie:
                        break
                if not bookie:
                    return []
            
            bookie_name = bookie.get("name", PREFERRED_BOOKIE_NAME)
            bets = bookie.get("bets", [])
            
            snapshots = []
            for market in markets:
                bet = next((b for b in bets if b["name"] == market), None)
                if bet:
                    odds = [{"label": str(v["value"]), "odds": float(v["odd"])} for v in bet.get("values", [])]
                    snapshots.append(build_snapshot(db_id, sport, bookie_name, market, odds))
            
            return snapshots
            
        except httpx.HTTPStatusError as e:
            logger.warning(f"   ⚠️ API {sport} error {e.response.status_code} for api_id={api_id}")
            return []
        except Exception as e:
            logger.warning(f"   ⚠️ {sport} api_id={api_id}: {e}")
            return []

    # ─── Tennis: a single call for all matches ──────────────────
    async def fetch_all_tennis_odds(self, client: httpx.AsyncClient, matches: list) -> list:
        today = datetime.now().strftime("%Y-%m-%d")
        stop = (datetime.now() + timedelta(days=WINDOW_DAYS)).strftime("%Y-%m-%d")
        
        try:
            resp = await client.get(
                "https://api.api-tennis.com/tennis/",
                params={"method": "get_odds", "date_start": today, "date_stop": stop, "APIkey": self.api_tennis_key}
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            logger.error(f"❌ Tennis API error: {e}")
            return []

        # api-tennis.com returns HTTP 200 even for account-level errors (e.g.
        # payment required) — the error lives in the body, not the status
        # code, as {"error": "1", "result": [{"msg": "...", ...}]} where
        # "result" is a LIST instead of the usual {match_key: {...}} dict.
        # Same shape rejected elsewhere (discover_matches.py) — check for it
        # explicitly rather than assume "result" is always a dict.
        if str(data.get("error", "0")) != "0":
            msg = (data.get("result") or [{}])[0].get("msg", "unknown error")
            logger.error(f"❌ Tennis API account error: {msg}")
            return []

        all_odds = data.get("result", {})
        if not all_odds or not isinstance(all_odds, dict):
            return []
        
        # Index by api_id to match against our DB matches
        api_id_to_db = {str(m["api_id"]): m["id"] for m in matches}
        
        all_snapshots = []
        matches_with_odds = 0
        
        for match_key, match_odds in all_odds.items():
            if match_key not in api_id_to_db:
                continue  # This match is not in our DB
            
            db_id = api_id_to_db[match_key]
            match_snapshots = []
            
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
                        for threshold, bookies in bookies_or_thresholds.items():
                            if isinstance(bookies, dict):
                                odd = bookies.get("bet365") or next(iter(bookies.values()), None)
                                if odd:
                                    values.append({"label": f"{outcome_name} {threshold}", "odds": float(odd)})
                    else:
                        odd = bookies_or_thresholds.get("bet365") or next(iter(bookies_or_thresholds.values()), None)
                        if odd:
                            try:
                                values.append({"label": outcome_name, "odds": float(odd)})
                            except (ValueError, TypeError):
                                pass
                
                if values:
                    match_snapshots.append(build_snapshot(db_id, "tennis", "bet365", market, values))
            
            if match_snapshots:
                matches_with_odds += 1
                all_snapshots.extend(match_snapshots)
        
        self.report["tennis"]["matches_with_odds"] = matches_with_odds
        self.report["tennis"]["snapshots"] = len(all_snapshots)
        return all_snapshots

    # ─── Main runner ─────────────────────────────────────────────
    async def run(self):
        logger.info("=" * 60)
        logger.info(f"  BETIX — Odds Ingestion ({WINDOW_DAYS}-day window, excludes live)")
        logger.info("=" * 60)
        
        all_snapshots = []
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            # ── Football ──
            fb_matches = self.get_upcoming_matches("football")
            logger.info(f"\n🏟️  Football — {len(fb_matches)} matches to process")
            fb_with_odds = 0
            for i, m in enumerate(fb_matches):
                snaps = await self.fetch_fb_bb_odds(client, "football", m)
                if snaps:
                    fb_with_odds += 1
                    all_snapshots.extend(snaps)
                # Progress log every 10 matches
                if (i + 1) % 10 == 0:
                    logger.info(f"   ... {i+1}/{len(fb_matches)} processed")
                await asyncio.sleep(0.3)  # Rate limit: ~3 req/s < 300/min
            
            self.report["football"]["matches_with_odds"] = fb_with_odds
            self.report["football"]["snapshots"] = sum(1 for s in all_snapshots if s["sport"] == "football")
            logger.info(f"   ✅ {fb_with_odds} matches with odds, {self.report['football']['snapshots']} snapshots")
            
            # ── Basketball ──
            bb_matches = self.get_upcoming_matches("basketball")
            logger.info(f"\n🏀 Basketball — {len(bb_matches)} matches to process")
            bb_with_odds = 0
            fb_count = len(all_snapshots)
            for i, m in enumerate(bb_matches):
                snaps = await self.fetch_fb_bb_odds(client, "basketball", m)
                if snaps:
                    bb_with_odds += 1
                    all_snapshots.extend(snaps)
                if (i + 1) % 10 == 0:
                    logger.info(f"   ... {i+1}/{len(bb_matches)} processed")
                await asyncio.sleep(0.3)
            
            self.report["basketball"]["matches_with_odds"] = bb_with_odds
            self.report["basketball"]["snapshots"] = len(all_snapshots) - fb_count
            logger.info(f"   ✅ {bb_with_odds} matches with odds, {self.report['basketball']['snapshots']} snapshots")
            
            # ── Tennis (single call) ──
            te_matches = self.get_upcoming_matches("tennis")
            logger.info(f"\n🎾 Tennis — {len(te_matches)} matches in the DB")
            te_snaps = await self.fetch_all_tennis_odds(client, te_matches)
            all_snapshots.extend(te_snaps)
            logger.info(f"   ✅ {self.report['tennis']['matches_with_odds']} matches with odds, {len(te_snaps)} snapshots")
        
        # ── DB insertion ──
        logger.info(f"\n📦 Total snapshots to insert: {len(all_snapshots)}")
        
        if not all_snapshots:
            logger.warning("⚠️ No snapshots — aborting.")
            self._print_report()
            return
        
        # Insert in batches of 500 to avoid timeouts
        BATCH = 500
        total_inserted = 0
        for i in range(0, len(all_snapshots), BATCH):
            batch = all_snapshots[i:i+BATCH]
            try:
                headers = {**self.db.headers, "Prefer": "return=minimal"}
                url = f"{self.db.base_url}/odds_snapshots"
                resp = httpx.post(url, headers=headers, json=batch, timeout=30.0)
                resp.raise_for_status()
                total_inserted += len(batch)
            except httpx.HTTPStatusError as e:
                logger.error(f"❌ Error inserting batch {i//BATCH+1}: {e.response.status_code} — {e.response.text[:200]}")
            except Exception as e:
                logger.error(f"❌ Error in batch {i//BATCH+1}: {e}")
        
        logger.info(f"\n✅ {total_inserted} snapshots inserted successfully!")
        self._print_report()

    def _print_report(self):
        logger.info("\n" + "=" * 60)
        logger.info("  📊 INGESTION REPORT")
        logger.info("=" * 60)
        
        total_matches = 0
        total_with_odds = 0
        total_snapshots = 0
        
        icons = {"football": "🏟️", "basketball": "🏀", "tennis": "🎾"}
        
        for sport, data in self.report.items():
            icon = icons[sport]
            found = data["matches_found"]
            with_odds = data["matches_with_odds"]
            snaps = data["snapshots"]
            pct = f"{with_odds/found*100:.0f}%" if found > 0 else "N/A"
            
            logger.info(f"\n  {icon} {sport.upper()}")
            logger.info(f"     Matches found (DB)     : {found}")
            logger.info(f"     Matches with odds      : {with_odds} ({pct})")
            logger.info(f"     Snapshots inserted      : {snaps}")
            
            total_matches += found
            total_with_odds += with_odds
            total_snapshots += snaps
        
        logger.info(f"\n  {'─'*40}")
        logger.info(f"  📈 TOTAL: {total_matches} matches → {total_with_odds} with odds → {total_snapshots} snapshots")
        logger.info("=" * 60)


if __name__ == "__main__":
    ingester = OddsIngester()
    asyncio.run(ingester.run())
