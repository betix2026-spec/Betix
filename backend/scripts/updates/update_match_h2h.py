"""
BETIX — update_match_h2h.py
Targeted Head-to-Head (H2H) update for ONE specific match.
Fetches both teams for the match, then runs the H2H lookup for that pair.

Usage:
    python update_match_h2h.py --sport football --match-id 123456
    python update_match_h2h.py --sport basketball --match-id 456789
"""

import asyncio
import argparse
import logging
import sys
import os
import httpx
from datetime import datetime

# Path setup for app imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s — %(message)s")
logger = logging.getLogger("betix.update_h2h")

SPORT_CONFIG = {
    "football": {
        "base_url": "https://v3.football.api-sports.io",
        "api_host": "v3.football.api-sports.io",
        "endpoint": "/fixtures/headtohead",
        "match_table": "football_matches",
        "h2h_table": "football_h2h",
    },
    "basketball": {
        "base_url": "https://v1.basketball.api-sports.io",
        "api_host": "v1.basketball.api-sports.io",
        "endpoint": "/games", 
        "match_table": "basketball_matches",
        "h2h_table": "basketball_h2h",
    }
}

class SingleMatchH2HUpdater:
    def __init__(self, sport: str):
        self.sport = sport
        self.conf = SPORT_CONFIG[sport]
        settings = get_settings()
        self.api_key = settings.API_SPORTS_KEY
        self.db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="analytics")
        self.client = httpx.AsyncClient(
            base_url=self.conf["base_url"],
            headers={
                "x-rapidapi-key": self.api_key,
                "x-rapidapi-host": self.conf["api_host"]
            },
            timeout=20.0
        )

    async def close(self):
        await self.client.aclose()

    async def get_team_pair(self, match_id: int) -> tuple[int, int] | None:
        """Fetches the internal team IDs for this match."""
        rows = self.db.select(
            self.conf["match_table"],
            "home_team_id,away_team_id",
            {"api_id": match_id}
        )
        if not rows:
            logger.error(f"❌ Match {match_id} not found in {self.conf['match_table']}")
            return None

        home_id = rows[0]["home_team_id"]
        away_id = rows[0]["away_team_id"]
        return home_id, away_id

    async def get_team_api_ids(self, team_ids: list[int]) -> dict[int, int]:
        """Converts internal ID -> API ID."""
        if not team_ids: return {}
        # Uses select_raw to get the exact 'in' filter format: id=in.(1,2)
        teams_str = ",".join(map(str, team_ids))
        query = f"select=id,api_id&id=in.({teams_str})"
        rows = self.db.select_raw("teams", query)
        return {r["id"]: r["api_id"] for r in rows}

    def process_api_response(self, data, team_a, team_b, api_a):
        """H2H processing logic (copied from fetch_h2h_v2.py)."""
        if not data: return None

        try:
            date_key = lambda x: x["fixture"]["date"] if self.sport == "football" else x["date"]
            data.sort(key=date_key, reverse=True)
        except: pass

        wins_a, wins_b, draws = 0, 0, 0
        score_a_total, score_b_total, games_count = 0, 0, 0
        last_5_res = []
        detailed_history = [] 

        for item in data:
            if self.sport == "football":
                s_home, s_away = item["goals"]["home"], item["goals"]["away"]
                fid_home, match_date = item["teams"]["home"]["id"], item["fixture"]["date"]
            else: # basketball
                s_home = item["scores"]["home"]["total"] if isinstance(item["scores"]["home"], dict) else item["scores"]["home"]
                s_away = item["scores"]["away"]["total"] if isinstance(item["scores"]["away"], dict) else item["scores"]["away"]
                fid_home, match_date = item["teams"]["home"]["id"], item["date"]

            if s_home is None or s_away is None: continue

            # Normalize vs Team A
            if fid_home == api_a:
                s_for, s_against, is_home = s_home, s_away, True
            else:
                s_for, s_against, is_home = s_away, s_home, False
            
            score_a_total += s_for
            score_b_total += s_against
            games_count += 1

            if s_for > s_against: wins_a += 1; res_code = "W"
            elif s_against > s_for: wins_b += 1; res_code = "L"
            else: draws += 1; res_code = "D"
            
            if len(last_5_res) < 5: last_5_res.append(res_code)
            
            if self.sport == "basketball" and len(detailed_history) < 5:
                winner = "A" if res_code == "W" else ("B" if res_code == "L" else "D")
                detailed_history.append({
                    "date": match_date,
                    "score": f"{s_for}-{s_against}" if is_home else f"{s_against}-{s_for}",
                    "winner": winner
                })

        if games_count == 0: return None

        row = {"team_a_id": team_a, "team_b_id": team_b, "updated_at": datetime.now().isoformat()}

        if self.sport == "football":
            row.update({
                "team_a_wins": wins_a, "team_b_wins": wins_b, "draws": draws, "total_matches": games_count,
                "avg_goals_a": round(score_a_total / games_count, 2),
                "avg_goals_b": round(score_b_total / games_count, 2),
                "last_5_results": last_5_res
            })
        else: # basketball
            row.update({
                "season": 9999, "games_played": games_count, "team_a_wins": wins_a,
                "avg_margin": round((score_a_total - score_b_total) / games_count, 1),
                "last_results": detailed_history
            })
        return row

    async def update(self, match_id: int):
        logger.info(f"🆚 Update H2H for Match {match_id} ({self.sport})")
        
        # 1. Get Team IDs
        pair = await self.get_team_pair(match_id)
        if not pair: return
        
        team_a, team_b = sorted(pair) # Always stored A < B
        logger.info(f"   Teams Internal IDs: {team_a} vs {team_b}")

        # 2. Get API IDs
        mapping = await self.get_team_api_ids([team_a, team_b])
        api_a, api_b = mapping.get(team_a), mapping.get(team_b)

        if not api_a or not api_b:
            logger.error("❌ API IDs not found for these teams.")
            return

        logger.info(f"   API IDs: {api_a} vs {api_b}")

        # 3. Fetch H2H
        try:
            params = {"h2h": f"{api_a}-{api_b}"}
            resp = await self.client.get(self.conf["endpoint"], params=params)
            resp.raise_for_status()
            data = resp.json().get("response", [])
            
            if not data:
                logger.warning("⚠️ No H2H data found.")
                return

            row = self.process_api_response(data, team_a, team_b, api_a)
            if row:
                cols = "team_a_id,team_b_id" + (",season" if self.sport == "basketball" else "")
                self.db.upsert(self.conf["h2h_table"], [row], on_conflict=cols)
                logger.info("✅ H2H Updated Successfully.")
                # print(row) # Debug
            else:
                logger.warning("⚠️ Insufficient data to generate an H2H row.")

        except Exception as e:
            logger.error(f"❌ Error while updating H2H: {e}")

async def main():
    parser = argparse.ArgumentParser(description="Update specific match H2H")
    parser.add_argument("--sport", choices=["football", "basketball"], required=True)
    parser.add_argument("--match-id", type=int, required=True)
    args = parser.parse_args()
    
    updater = SingleMatchH2HUpdater(args.sport)
    try:
        await updater.update(args.match_id)
    finally:
        await updater.close()

if __name__ == "__main__":
    asyncio.run(main())
