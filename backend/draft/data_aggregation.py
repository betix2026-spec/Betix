
import asyncio
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime

from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST

# Configure logging
logger = logging.getLogger(__name__)

class DataAggregator:
    def __init__(self):
        self.settings = get_settings()
        # Initialize SupabaseREST for 'analytics' schema
        self.db = SupabaseREST(
            self.settings.SUPABASE_URL, 
            self.settings.SUPABASE_SERVICE_ROLE_KEY, 
            schema="analytics"
        )

    async def get_match_context(self, sport: str, match_id: int) -> Dict[str, Any]:
        """
        Aggregates all available data for a given match into a structured JSON context for the AI.
        """
        start_time = datetime.now()
        
        if sport == "tennis":
            return await self._get_tennis_context(match_id, start_time)
        else:
            return await self._get_team_sport_context(sport, match_id, start_time)

    # =========================================================================
    # TEAM SPORTS (Football / Basketball)
    # =========================================================================

    async def _get_team_sport_context(self, sport: str, match_id: int, start_time) -> Dict[str, Any]:
        """Context builder for team-based sports (football, basketball)."""
        results = await asyncio.gather(
            self.fetch_match_details(sport, match_id),
            self.fetch_team_details(sport, match_id),
            self.fetch_h2h(sport, match_id),
            self.fetch_rolling_stats(sport, match_id),
            self.fetch_odds(sport, match_id),
            self.fetch_elo(sport, match_id),
            self.fetch_injuries(sport, match_id),
            return_exceptions=True
        )
        
        match_data = self._handle_result(results[0], "match", {})
        team_data = self._handle_result(results[1], "teams", {})
        h2h_data = self._handle_result(results[2], "h2h", {})
        form_data = self._handle_result(results[3], "form", {})
        odds_data = self._handle_result(results[4], "odds", None)
        elo_data = self._handle_result(results[5], "elo", None)
        injuries_data = self._handle_result(results[6], "injuries", {"home": [], "away": []})

        context = {
            "meta": {
                "sport": sport,
                "match_id": match_id,
                "fetched_at": datetime.now().isoformat()
            },
            "match": match_data,
            "home_team": {
                "name": team_data.get("home", {}).get("name", "Unknown Home"),
                "id": team_data.get("home", {}).get("id"),
                "form": form_data.get("home", {}),
                "injuries": injuries_data.get("home", [])
            },
            "away_team": {
                "name": team_data.get("away", {}).get("name", "Unknown Away"),
                "id": team_data.get("away", {}).get("id"),
                "form": form_data.get("away", {}),
                "injuries": injuries_data.get("away", [])
            },
            "h2h": h2h_data,
            "odds": odds_data,
            "elo": elo_data
        }
        
        duration = (datetime.now() - start_time).total_seconds()
        logger.info(f"Context built for {sport} match {match_id} in {duration:.3f}s")
        return context

    # =========================================================================
    # TENNIS
    # =========================================================================

    async def _get_tennis_context(self, match_id: int, start_time) -> Dict[str, Any]:
        """Context builder for tennis (player-based sport)."""
        results = await asyncio.gather(
            self.fetch_tennis_match_details(match_id),
            self.fetch_tennis_players(match_id),
            self.fetch_tennis_h2h(match_id),
            self.fetch_tennis_rolling(match_id),
            self.fetch_odds("tennis", match_id),
            return_exceptions=True
        )
        
        match_data = self._handle_result(results[0], "match", {})
        players_data = self._handle_result(results[1], "players", {})
        h2h_data = self._handle_result(results[2], "h2h", {})
        rolling_data = self._handle_result(results[3], "rolling", {})
        odds_data = self._handle_result(results[4], "odds", None)

        context = {
            "meta": {
                "sport": "tennis",
                "match_id": match_id,
                "fetched_at": datetime.now().isoformat()
            },
            "match": match_data,
            "player1": {
                "name": players_data.get("player1", {}).get("name", "Unknown"),
                "id": players_data.get("player1", {}).get("id"),
                "country": players_data.get("player1", {}).get("country"),
                "form": rolling_data.get("player1", {})
            },
            "player2": {
                "name": players_data.get("player2", {}).get("name", "Unknown"),
                "id": players_data.get("player2", {}).get("id"),
                "country": players_data.get("player2", {}).get("country"),
                "form": rolling_data.get("player2", {})
            },
            "h2h": h2h_data,
            "odds": odds_data
        }
        
        duration = (datetime.now() - start_time).total_seconds()
        logger.info(f"Context built for TENNIS match {match_id} in {duration:.3f}s")
        return context

    # =========================================================================
    # COMMON HELPERS
    # =========================================================================

    def _handle_result(self, result, name, default):
        if isinstance(result, Exception):
            logger.error(f"Error fetching {name}: {str(result)}")
            return default
        return result

    # =========================================================================
    # TEAM SPORT FETCHERS (Football / Basketball) — unchanged
    # =========================================================================

    async def fetch_match_details(self, sport: str, match_id: int) -> Dict[str, Any]:
        table = f"{sport}_matches"
        columns = "date_time,venue,status"
        if sport == 'football':
            columns += ",round,referee_name,weather"
        
        rows = self.db.select(table, columns, {"id": match_id})
        if not rows:
            return {}
        return rows[0]

    async def fetch_team_details(self, sport: str, match_id: int) -> Dict[str, Any]:
        table = f"{sport}_matches"
        columns = "home_team:teams!home_team_id(id,name),away_team:teams!away_team_id(id,name)"
        
        rows = self.db.select(table, columns, {"id": match_id})
        if not rows:
            return {}
            
        data = rows[0]
        return {
            "home": data.get("home_team", {}),
            "away": data.get("away_team", {})
        }

    async def fetch_h2h(self, sport: str, match_id: int) -> Dict[str, Any]:
        match_table = f"{sport}_matches"
        rows = self.db.select(match_table, "home_team_id,away_team_id", {"id": match_id})
        if not rows:
            return {}
        
        h1, a1 = rows[0]["home_team_id"], rows[0]["away_team_id"]
        h2h_table = f"{sport}_h2h"
        
        res = self.db.select(h2h_table, "*", {"team_a_id": h1, "team_b_id": a1})
        if not res:
            res = self.db.select(h2h_table, "*", {"team_a_id": a1, "team_b_id": h1})
        
        if not res:
            return {"summary": "No H2H found"}
        return res[0]

    async def fetch_rolling_stats(self, sport: str, match_id: int) -> Dict[str, Any]:
        match_table = f"{sport}_matches"
        m_rows = self.db.select(match_table, "date_time,home_team_id,away_team_id", {"id": match_id})
        if not m_rows:
            return {}
            
        m = m_rows[0]
        match_date = m['date_time']
        rolling_table = f"{sport}_team_rolling"
        
        def get_team_rolling_history(team_id, venue_filter, count=5):
            filters = {
                "team_id": team_id, 
                "date": ("lte", match_date),
                "venue": venue_filter
            }
            rows = self.db.select(
                rolling_table, "*", 
                filters=filters, limit=count, order="date.desc"
            )
            return rows

        home_stats = {
            "global": get_team_rolling_history(m['home_team_id'], "all"),
            "home": get_team_rolling_history(m['home_team_id'], "home"),
            "away": get_team_rolling_history(m['home_team_id'], "away")
        }

        away_stats = {
            "global": get_team_rolling_history(m['away_team_id'], "all"),
            "home": get_team_rolling_history(m['away_team_id'], "home"),
            "away": get_team_rolling_history(m['away_team_id'], "away")
        }
        
        return {"home": home_stats, "away": away_stats}

    async def fetch_odds(self, sport: str, match_id: int) -> Optional[Dict[str, Any]]:
        """
        Fetch the LATEST odds snapshot for EACH market of a given match.
        Returns a dict keyed by market_name, e.g.:
        {
            "Match Winner": {"bookmaker": "Bet365", "snapshot_at": "...", "odds_data": [...]},
            "Goals Over/Under": {"bookmaker": "Bet365", "snapshot_at": "...", "odds_data": [...]},
            ...
        }
        """
        rows = self.db.select_raw(
            "odds_snapshots",
            f"match_id=eq.{match_id}"
            f"&sport=eq.{sport}"
            f"&select=market_name,bookmaker,snapshot_at,odds_data"
            f"&order=snapshot_at.desc"
        )
        
        if not rows:
            return None
        
        # Deduplicate: keep only the latest snapshot per market_name
        latest_by_market = {}
        for row in rows:
            mk = row["market_name"]
            if mk not in latest_by_market:
                latest_by_market[mk] = {
                    "bookmaker": row["bookmaker"],
                    "snapshot_at": row["snapshot_at"],
                    "odds_data": row["odds_data"]
                }
        
        return latest_by_market

    async def fetch_elo(self, sport: str, match_id: int) -> Optional[Dict[str, Any]]:
        match_table = f"{sport}_matches"
        m_rows = self.db.select(match_table, "date_time,home_team_id,away_team_id", {"id": match_id})
        if not m_rows:
            return None
            
        m = m_rows[0]
        match_date = m['date_time']
        elo_table = f"{sport}_team_elo"
        
        def get_team_elo_history(team_id, count=5):
            rows = self.db.select(
                elo_table, "*", 
                filters={"team_id": team_id, "date": ("lte", match_date)}, 
                limit=count, order="date.desc"
            )
            return rows

        home_elo = get_team_elo_history(m['home_team_id'])
        away_elo = get_team_elo_history(m['away_team_id'])
        
        if not home_elo and not away_elo:
            return None
            
        return {"home": home_elo, "away": away_elo}

    async def fetch_injuries(self, sport: str, match_id: int) -> Dict[str, List[Any]]:
        return {"home": [], "away": []}

    # =========================================================================
    # TENNIS FETCHERS
    # =========================================================================

    async def fetch_tennis_match_details(self, match_id: int) -> Dict[str, Any]:
        """Fetch match info: surface, indoor/outdoor, round, date, sets."""
        rows = self.db.select(
            "tennis_matches",
            "date_time,surface,indoor_outdoor,round,status,sets_played,score",
            {"id": match_id}
        )
        if not rows:
            return {}
        return rows[0]

    async def fetch_tennis_players(self, match_id: int) -> Dict[str, Any]:
        """Fetch player details for both participants via PostgREST JOIN."""
        rows = self.db.select(
            "tennis_matches",
            "player1:players!player1_id(id,name,country),player2:players!player2_id(id,name,country)",
            {"id": match_id}
        )
        if not rows:
            return {}
        
        data = rows[0]
        return {
            "player1": data.get("player1", {}),
            "player2": data.get("player2", {})
        }

    async def fetch_tennis_h2h(self, match_id: int) -> Dict[str, Any]:
        """Fetch H2H summary + last 5 meetings between the two players."""
        rows = self.db.select("tennis_matches", "player1_id,player2_id,date_time", {"id": match_id})
        if not rows:
            return {}
        
        p1 = rows[0]["player1_id"]
        p2 = rows[0]["player2_id"]
        match_date = rows[0]["date_time"]
        
        # 1. Aggregate summary from tennis_h2h table
        res = self.db.select("tennis_h2h", "*", {"player_a_id": p1, "player_b_id": p2})
        if not res:
            res = self.db.select("tennis_h2h", "*", {"player_a_id": p2, "player_b_id": p1})
        
        summary = res[0] if res else {}
        
        # 2. Last 5 individual meetings from tennis_matches
        #    Matches where (p1 vs p2) OR (p2 vs p1), before current match date
        clean_date = match_date.replace("+00:00", "Z").replace("+01:00", "Z").replace("+02:00", "Z")
        try:
            meetings = self.db.select_raw(
                "tennis_matches",
                f"select=date_time,player1_id,player2_id,winner_id,score,surface,sets_played"
                f"&status=eq.finished"
                f"&date_time=lt.{clean_date}"
                f"&or=(and(player1_id.eq.{p1},player2_id.eq.{p2}),and(player1_id.eq.{p2},player2_id.eq.{p1}))"
                f"&order=date_time.desc"
                f"&limit=5"
            )
        except Exception as e:
            logger.warning(f"Could not fetch H2H meetings: {e}")
            meetings = []
        
        return {
            "summary": summary,
            "last_5_meetings": meetings
        }

    async def fetch_tennis_rolling(self, match_id: int) -> Dict[str, Any]:
        """Fetch rolling stats for both players, filtered by surface and date."""
        m_rows = self.db.select(
            "tennis_matches", 
            "date_time,player1_id,player2_id,surface", 
            {"id": match_id}
        )
        if not m_rows:
            return {}
            
        m = m_rows[0]
        match_date = m["date_time"]
        surface = m.get("surface", "hard")

        def get_player_rolling(player_id, surf, count=5):
            """Get the latest rolling snapshots for a player on a given surface."""
            filters = {
                "player_id": player_id,
                "date": ("lte", match_date),
                "surface": surf
            }
            rows = self.db.select(
                "tennis_player_rolling", "*",
                filters=filters, limit=count, order="date.desc"
            )
            return rows

        p1_rolling = {
            "on_surface": get_player_rolling(m["player1_id"], surface),
            "overall": get_player_rolling(m["player1_id"], "all") if surface != "all" else []
        }
        
        p2_rolling = {
            "on_surface": get_player_rolling(m["player2_id"], surface),
            "overall": get_player_rolling(m["player2_id"], "all") if surface != "all" else []
        }

        return {
            "player1": p1_rolling,
            "player2": p2_rolling
        }


# Singleton instance
_aggregator = DataAggregator()

async def get_match_context(sport: str, match_id: int) -> Dict[str, Any]:
    return await _aggregator.get_match_context(sport, match_id)


# ─────────────────────────────────────────────────────────────────
# CLI — Direct usage: python -m app.engine.data_aggregation <sport> <match_id>
#        or auto mode: python -m app.engine.data_aggregation --find
# ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse
    import json
    import asyncio

    parser = argparse.ArgumentParser(description="Test the BETIX data aggregator")
    parser.add_argument("sport", nargs="?", choices=["football", "basketball", "tennis"],
                        help="Sport to test")
    parser.add_argument("match_id", nargs="?", type=int, help="Internal match ID")
    parser.add_argument("--find", action="store_true",
                        help="Automatically find a match with odds for each sport")
    args = parser.parse_args()

    async def find_matches_with_odds():
        """Finds a match with odds for each sport."""
        agg = DataAggregator()
        found = {}
        for sport in ["football", "basketball", "tennis"]:
            rows = agg.db.select_raw(
                "odds_snapshots",
                f"sport=eq.{sport}&select=match_id&limit=5&order=snapshot_at.desc"
            )
            if rows:
                # For each match_id found, verify it exists in the matches table
                table = f"{sport}_matches" if sport != "tennis" else "tennis_matches"
                for r in rows:
                    mid = r["match_id"]
                    check = agg.db.select(table, "id", {"id": mid})
                    if check:
                        found[sport] = mid
                        break
                if sport not in found and rows:
                    found[sport] = rows[0]["match_id"]  # Fallback: take the first one even if not found in matches
        return found

    async def run_single(sport: str, match_id: int):
        """Aggregates and prints the context for a given match."""
        print(f"\n🎯 Aggregating context for {sport} #{match_id}...\n")
        
        ctx = await get_match_context(sport, match_id)
        
        # Meta
        print(f"📋 Match: {ctx.get('match', {})}")
        
        # Teams / Players
        if sport == "tennis":
            p1 = ctx.get("player1", {})
            p2 = ctx.get("player2", {})
            print(f"👤 Player 1: {p1.get('name', '?')} | Form: {'✅' if p1.get('form') else '❌'}")
            print(f"👤 Player 2: {p2.get('name', '?')} | Form: {'✅' if p2.get('form') else '❌'}")
        else:
            ht = ctx.get("home_team", {})
            at = ctx.get("away_team", {})
            print(f"🏠 Home: {ht.get('name', '?')} | Form: {'✅' if ht.get('form') else '❌'} | Injuries: {len(ht.get('injuries', []))}")
            print(f"🚀 Away: {at.get('name', '?')} | Form: {'✅' if at.get('form') else '❌'} | Injuries: {len(at.get('injuries', []))}")
        
        # H2H
        h2h = ctx.get("h2h")
        print(f"🤝 H2H: {'✅ Available' if h2h and h2h != {'summary': 'No H2H found'} else '❌ Not available'}")
        
        # ELO
        elo = ctx.get("elo")
        print(f"🏆 ELO: {'✅ Available' if elo else '❌ Not available'}")
        
        # Cotes
        odds = ctx.get("odds")
        if odds:
            print(f"\n📊 Odds Markets ({len(odds)}):")
            for mk, data in odds.items():
                od = data["odds_data"]
                if isinstance(od, str):
                    od = json.loads(od)
                labels = ", ".join([f"{o['label']}={o['odds']}" for o in od[:4]])
                print(f"   📈 {mk}: {labels}{'...' if len(od) > 4 else ''}")
        else:
            print(f"\n⚠️ No odds found")
        
        print(f"\n{'='*60}")
        print(f"💾 Full JSON ({len(json.dumps(ctx, default=str))} bytes)")

    async def main():
        if args.find:
            print("🔍 Searching for matches with odds...\n")
            found = await find_matches_with_odds()
            if not found:
                print("❌ No match with odds found.")
                return
            for sport, mid in found.items():
                print(f"{'='*60}")
                await run_single(sport, mid)
        elif args.sport and args.match_id:
            await run_single(args.sport, args.match_id)
        else:
            parser.print_help()

    asyncio.run(main())
