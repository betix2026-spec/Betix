"""
BETIX — update_match_stats.py
Targeted stats update for ONE specific match.
Lets you fix or force-refresh a single match's stats without scanning the whole DB.

Usage:
    python update_match_stats.py --sport football --match-id 123456
    python update_match_stats.py --sport basketball --match-id 456789
"""

import asyncio
import argparse
import logging
import sys
import os
import httpx
from typing import Optional

# Path setup for app imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST

# Parsers duplicated from fetch_match_stats.py to keep this script
# independent (avoids a complex circular import).
def _parse_pct(value) -> Optional[float]:
    if value is None: return None
    if isinstance(value, str): value = value.replace("%", "").strip()
    try: return float(value)
    except: return None

def _parse_int(value) -> Optional[int]:
    if value is None: return None
    try: return int(value)
    except: return None

def _parse_float(value) -> Optional[float]:
    if value is None: return None
    try: return float(value)
    except: return None

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s — %(message)s")
logger = logging.getLogger("betix.update_stats")

class SingleMatchStatsUpdater:
    def __init__(self):
        settings = get_settings()
        self.api_key = settings.API_SPORTS_KEY
        self.db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="analytics")
        self._team_cache = {}

    def _load_team_cache(self, sport: str):
        rows = self.db.select("teams", "id,api_id", {"sport": sport})
        self._team_cache = {r["api_id"]: r["id"] for r in rows}
        logger.info(f"Loaded {len(self._team_cache)} teams for {sport}")

    async def update_football(self, match_id: int):
        logger.info(f"⚽ Update Football Match {match_id}")
        self._load_team_cache("football")
        
        async with httpx.AsyncClient(
            base_url="https://v3.football.api-sports.io",
            headers={"x-apisports-key": self.api_key},
            timeout=10.0
        ) as client:
            resp = await client.get("/fixtures/statistics", params={"fixture": match_id})
            resp.raise_for_status()
            data = resp.json()
            
            stats_response = data.get("response", [])
            if not stats_response:
                logger.warning("⚠️ No statistics found for this match on API.")
                return

            rows = []
            for team_stats in stats_response:
                team_api_id = team_stats.get("team", {}).get("id")
                statistics = team_stats.get("statistics", [])
                
                team_internal = self._team_cache.get(team_api_id)
                if not team_internal:
                    logger.warning(f"⚠️ Team API ID {team_api_id} not found in DB.")
                    continue
                
                stat_map = {s["type"]: s["value"] for s in statistics}
                
                rows.append({
                    "match_id": match_id,
                    "team_id": team_internal,
                    "possession_pct": _parse_pct(stat_map.get("Ball Possession")),
                    "shots_on_goal": _parse_int(stat_map.get("Shots on Goal")),
                    "shots_total": _parse_int(stat_map.get("Total Shots")),
                    "passes_total": _parse_int(stat_map.get("Total passes")),
                    "passes_accurate": _parse_int(stat_map.get("Passes accurate")),
                    "fouls": _parse_int(stat_map.get("Fouls")),
                    "corners": _parse_int(stat_map.get("Corner Kicks")),
                    "yellow_cards": _parse_int(stat_map.get("Yellow Cards")) or 0,
                    "red_cards": _parse_int(stat_map.get("Red Cards")) or 0,
                    "expected_goals": _parse_float(stat_map.get("expected_goals")),
                })
                
            if rows:
                self.db.upsert("football_match_stats", rows, on_conflict="match_id,team_id")
                logger.info(f"✅ Successfully updated stats for {len(rows)} teams.")
            else:
                logger.error("❌ Failed to parse any stats rows.")

    async def update_basketball(self, match_id: int):
        logger.info(f"🏀 Update Basketball Match {match_id}")
        self._load_team_cache("basketball")
        
        # Need match details for advanced stats (scores)
        match_info_rows = self.db.select("basketball_matches", "api_id,home_team_id,away_team_id,home_score,away_score", {"api_id": match_id})
        match_info = match_info_rows[0] if match_info_rows else None
        
        async with httpx.AsyncClient(
            base_url="https://v1.basketball.api-sports.io",
            headers={"x-apisports-key": self.api_key},
            timeout=10.0
        ) as client:
            resp = await client.get("/games/statistics/teams", params={"id": match_id})
            resp.raise_for_status()
            data = resp.json()
            
            stats_response = data.get("response", [])
            if not stats_response:
                logger.warning("⚠️ No statistics found for this match on API.")
                return

            rows = []
            for team_stats in stats_response:
                team_api_id = team_stats.get("team", {}).get("id")
                
                team_internal = self._team_cache.get(team_api_id)
                if not team_internal:
                    logger.warning(f"⚠️ Team API ID {team_api_id} not found in DB.")
                    continue
                
                fg = team_stats.get("field_goals", {}) or {}
                tp = team_stats.get("threepoint_goals", {}) or {}
                ft = team_stats.get("freethrows_goals", {}) or {}
                reb = team_stats.get("rebounds", {}) or {}
                
                fgm = _parse_int(fg.get("total"))
                fga = _parse_int(fg.get("attempts"))
                ftm = _parse_int(ft.get("total"))
                fta = _parse_int(ft.get("attempts"))
                off_reb = _parse_int(reb.get("offence"))
                def_reb = _parse_int(reb.get("defense"))
                tov = _parse_int(team_stats.get("turnovers"))
                
                # Advanced metrics (simplified for target update)
                vals = {
                    "match_id": match_id,
                    "team_id": team_internal,
                    "fga": fga, "fgm": fgm,
                    "tpa": _parse_int(tp.get("attempts")), "tpm": _parse_int(tp.get("total")),
                    "fta": fta, "ftm": ftm,
                    "off_rebounds": off_reb, "def_rebounds": def_reb,
                    "assists": _parse_int(team_stats.get("assists")),
                    "turnovers": tov,
                    "steals": _parse_int(team_stats.get("steals")),
                    "blocks": _parse_int(team_stats.get("blocks")),
                    "fouls": _parse_int(team_stats.get("personal_fouls")),
                }
                
                # Advanced metrics (Formula-based)
                if fga and fga > 0:
                    try:
                        # 1. basic percentages
                        tpa = vals["tpa"] or 0
                        tpm = vals["tpm"] or 0
                        vals["efg_pct"] = round((fgm + 0.5 * tpm) / fga * 100, 1) if fgm is not None else None
                        
                        total_reb = (off_reb or 0) + (def_reb or 0)
                        vals["orb_pct"] = round(off_reb / total_reb * 100, 1) if total_reb > 0 and off_reb is not None else None
                        vals["ftr"] = round(fta / fga * 100, 1) if fta is not None else None

                        # 2. Basketball Possessions Formula: 0.96 * (FGA + TOV + 0.44 * FTA - ORB)
                        poss = 0.96 * (fga + (tov or 0) + 0.44 * (fta or 0) - (off_reb or 0))
                        vals["possessions"] = round(poss, 1)

                        # 3. Defensive/Offensive Rating (requires match score)
                        if match_info:
                            home_api = match_info.get("home_team_id")
                            score_team = match_info["home_score"] if team_api_id == home_api else match_info["away_score"]
                            score_opp = match_info["away_score"] if team_api_id == home_api else match_info["home_score"]

                            if poss > 0:
                                vals["ortg"] = round((score_team / poss) * 100, 1) if score_team is not None else None
                                vals["drtg"] = round((score_opp / poss) * 100, 1) if score_opp is not None else None
                    except Exception as e:
                        logger.warning(f"⚠️ Advanced calc failed for team {team_api_id}: {e}")
                
                rows.append(vals)
            
            # 4. Pace calculation (Pace = 48 * ((Poss_Home + Poss_Away) / (2 * (Minutes_Played/5))))
            # Simplification: Pace is team average possessions per 48 mins
            # Note: Pace is not in basketball_match_stats table, but used in rolling calculation.
            if len(rows) == 2:
                p1 = rows[0].get("possessions")
                p2 = rows[1].get("possessions")
                if p1 and p2:
                    avg_pace = round((p1 + p2) / 2, 1) # Assumes 48 mins game
                    # We store it in the dict so update_match_rolling can pick it up if it were to read from here,
                    # but we keep it out of the final DB upsert if the column doesn't exist.
                    # For now, let's just make sure we don't crash the upsert.
                    pass
                
            if rows:
                self.db.upsert("basketball_match_stats", rows, on_conflict="match_id,team_id")
                logger.info(f"✅ Successfully updated stats for {len(rows)} teams.")
            else:
                logger.error("❌ Failed to parse any stats rows.")

async def main():
    parser = argparse.ArgumentParser(description="Update specific match stats")
    parser.add_argument("--sport", choices=["football", "basketball"], required=True)
    parser.add_argument("--match-id", type=int, required=True)
    args = parser.parse_args()
    
    updater = SingleMatchStatsUpdater()
    
    if args.sport == "football":
        await updater.update_football(args.match_id)
    elif args.sport == "basketball":
        await updater.update_basketball(args.match_id)

if __name__ == "__main__":
    asyncio.run(main())
