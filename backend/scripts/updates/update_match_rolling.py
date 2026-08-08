"""
BETIX — update_match_rolling.py
Targeted Rolling Stats (streaks) update for ONE specific match.
Recomputes stats (L5, L10, etc.) for both teams involved, as of the match date.

Usage:
    python update_match_rolling.py --sport football --match-id 123456
    python update_match_rolling.py --sport basketball --match-id 456789
"""

import asyncio
import argparse
import logging
import sys
import os
from datetime import datetime, timedelta

# Path setup for app imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s — %(message)s")
logger = logging.getLogger("betix.update_rolling")

class SingleMatchRollingUpdater:
    def __init__(self, sport: str):
        self.sport = sport
        settings = get_settings()
        self.db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="analytics")
        self.match_table = "football_matches" if sport == "football" else "basketball_matches"
        self.rolling_table = "football_team_rolling" if sport == "football" else "basketball_team_rolling"

    async def get_match_details(self, match_id: int):
        rows = self.db.select(
            self.match_table, 
            "id,api_id,home_team_id,away_team_id,date_time,home_score,away_score", 
            {"api_id": match_id}
        )
        return rows[0] if rows else None

    async def get_team_history(self, team_id: int, before_date: str, limit: int = 20):
        """Fetches the team's last N matches BEFORE the given date."""
        # Needs matches where the team is either home or away
        # Supabase complex filtering: or=(home_team_id.eq.X,away_team_id.eq.X) AND date_time.lt.DATE
        # Built as a raw query since the wrapper's dict-based filters can't express 'or' + 'and' together.

        # DATE ENCODING FIX:
        # The '+' in '2023-01-01T12:00:00+00:00' is treated as a space by URL decoders.
        # We must replace it with '%2B' OR use urllib.parse.quote.
        # Here we manually replace '+' with '%2B' for safety.
        safe_date = before_date.replace("+", "%2B")

        # Build the query string manually and cleanly
        query = (
            f"select=id,api_id,home_team_id,away_team_id,home_score,away_score,date_time&"
            f"or=(home_team_id.eq.{team_id},away_team_id.eq.{team_id})&"
            f"date_time=lt.{safe_date}&"
            f"status=eq.finished&"
            f"order=date_time.desc&"
            f"limit={limit}"
        )
        # Strip any stray newlines/spaces that would break the URL
        query = query.replace("\n", "").replace(" ", "")

        rows = self.db.select_raw(self.match_table, query)
        # Restore chronological order for the calculation
        return sorted(rows, key=lambda x: x["date_time"])

    def compute_football_stats(self, team_id: int, match_date: str, venue: str, history: list):
        # history is chronological
        last_5 = history[-5:]
        if not last_5: return None
        n = len(last_5)

        points = 0
        goals_for = 0
        goals_against = 0
        clean_sheets = 0
        wins = 0
        btts_count = 0
        over25_count = 0
        
        xg_for, xg_against = [], []
        possession = []
        shots, corners, cards = [], [], []
        passes_acc, passes_tot = [], []
        form_list = []
        
        match_ids = [m["api_id"] for m in last_5]
        # Using select_raw for a more robust 'in' filter
        stats_query = f"match_id=in.({','.join(map(str, match_ids))})"
        stats_rows = self.db.select_raw("football_match_stats", stats_query)
        stats_map = {(s["match_id"], s["team_id"]): s for s in stats_rows}

        for pm in last_5:
            is_home = pm["home_team_id"] == team_id
            opp_id = pm["away_team_id"] if is_home else pm["home_team_id"]
            
            gf = (pm.get("home_score") or 0) if is_home else (pm.get("away_score") or 0)
            ga = (pm.get("away_score") or 0) if is_home else (pm.get("home_score") or 0)
            
            goals_for += gf
            goals_against += ga
            if ga == 0: clean_sheets += 1
            
            if gf > ga: 
                points += 3
                wins += 1
                form_list.append('W')
            elif gf == ga: 
                points += 1
                form_list.append('D')
            else:
                form_list.append('L')
            
            if gf > 0 and ga > 0: btts_count += 1
            if (gf + ga) > 2.5: over25_count += 1

            # Advanced stats from football_match_stats
            s = stats_map.get((pm["api_id"], team_id))
            if s:
                if s.get("expected_goals") is not None: xg_for.append(float(s["expected_goals"]))
                if s.get("possession_pct") is not None: possession.append(float(s["possession_pct"]))
                if s.get("shots_total") is not None: shots.append(int(s["shots_total"]))
                if s.get("corners") is not None: corners.append(int(s["corners"]))
                y_cards = int(s.get("yellow_cards") or 0)
                r_cards = int(s.get("red_cards") or 0)
                cards.append(y_cards + r_cards)
                if s.get("passes_accurate") is not None and s.get("passes_total") is not None:
                    passes_acc.append(int(s["passes_accurate"]))
                    passes_tot.append(int(s["passes_total"]))
            
            s_opp = stats_map.get((pm["api_id"], opp_id))
            if s_opp and s_opp.get("expected_goals") is not None:
                xg_against.append(float(s_opp["expected_goals"]))
                
        # Streak calculation
        streak_val = 0
        streak_char = ''
        if form_list:
            streak_char = form_list[-1]
            for char in reversed(form_list):
                if char == streak_char: streak_val += 1
                else: break
        l5_streak = f"{streak_val}{streak_char}" if streak_val > 0 else None
        
        # xG Diff calculation
        l5_xg_diff = None
        l5_xg_for_avg = round(sum(xg_for) / len(xg_for), 2) if xg_for else None
        l5_xg_against_avg = round(sum(xg_against) / len(xg_against), 2) if xg_against else None
        if l5_xg_for_avg is not None and l5_xg_against_avg is not None:
            l5_xg_diff = round(l5_xg_for_avg - l5_xg_against_avg, 2)
            
        # Pass accuracy
        l5_pass_accuracy = None
        if sum(passes_tot) > 0:
            l5_pass_accuracy = round((sum(passes_acc) / sum(passes_tot)) * 100, 1)

        return {
            "team_id": team_id,
            "date": match_date[:10],
            "venue": venue,
            "l5_points": points,
            "l5_ppm": round(points / n, 2),
            "l5_goals_for": round(goals_for / n, 1),
            "l5_goals_against": round(goals_against / n, 1),
            "l5_xg_for": l5_xg_for_avg,
            "l5_xg_against": l5_xg_against_avg,
            "l5_xg_diff": l5_xg_diff,
            "l5_possession_avg": round(sum(possession) / len(possession), 1) if possession else None,
            "l5_shots_avg": round(sum(shots) / len(shots), 1) if shots else None,
            "l5_corners_avg": round(sum(corners) / len(corners), 1) if corners else None,
            "l5_cards_avg": round(sum(cards) / len(cards), 1) if cards else None,
            "l5_clean_sheets": clean_sheets,
            "l5_win_rate": round((wins / n) * 100, 1),
            "l5_btts_rate": round((btts_count / n) * 100, 1),
            "l5_over25_rate": round((over25_count / n) * 100, 1),
            "l5_form": form_list,
            "l5_streak": l5_streak,
            "l5_pass_accuracy": l5_pass_accuracy
        }

    def compute_basketball_stats(self, team_id: int, match_date: str, venue: str, history: list):
        # history is chronological
        last_5 = history[-5:]
        if not last_5: return None
        n5 = len(last_5)

        match_dt = datetime.fromisoformat(match_date.replace("Z", "+00:00"))
        
        # 1. Fatigue (Basic)
        rest_days = None
        is_b2b = False
        if history:
            last_match = history[-1]
            last_dt = datetime.fromisoformat(last_match["date_time"].replace("Z", "+00:00"))
            diff = match_dt - last_dt
            rest_days = diff.days
            is_b2b = rest_days <= 1

        seven_days_ago = match_dt - timedelta(days=7)
        games_in_7 = sum(1 for m in history if datetime.fromisoformat(m["date_time"].replace("Z", "+00:00")) >= seven_days_ago)

        # 2. Advanced Stats Mapping
        def get_avg_stats(h_list):
            if not h_list: return {}
            m_ids = [m["api_id"] for m in h_list]
            stats_query = f"match_id=in.({','.join(map(str, m_ids))})"
            rows = self.db.select_raw("basketball_match_stats", stats_query)
            m_map = {(s["match_id"], s["team_id"]): s for s in rows}
            
            wins = 0
            form_list = []
            margins = []
            ortgs, drtgs, paces, efgs, tovs, orbs, ftrs = [], [], [], [], [], [], []
            tpms, tpas = [], []
            
            for pm in h_list:
                is_home = pm["home_team_id"] == team_id
                hs = pm.get("home_score") or 0
                ascore = pm.get("away_score") or 0
                
                score_for = hs if is_home else ascore
                score_opp = ascore if is_home else hs
                diff = score_for - score_opp
                margins.append(diff)
                
                if diff > 0:
                    wins += 1
                    form_list.append('W')
                else:
                    form_list.append('L')
                
                s = m_map.get((pm["api_id"], team_id))
                if s:
                    if s.get("ortg") is not None: ortgs.append(float(s["ortg"]))
                    if s.get("drtg") is not None: drtgs.append(float(s["drtg"]))
                    p_val = s.get("pace") if s.get("pace") is not None else s.get("possessions")
                    if p_val is not None: paces.append(float(p_val))
                    if s.get("efg_pct") is not None: efgs.append(float(s["efg_pct"]))
                    if s.get("tov_pct") is not None: tovs.append(float(s["tov_pct"]))
                    if s.get("orb_pct") is not None: orbs.append(float(s["orb_pct"]))
                    if s.get("ftr") is not None: ftrs.append(float(s["ftr"]))
                    if s.get("tpm") is not None and s.get("tpa") is not None:
                        tpms.append(int(s["tpm"]))
                        tpas.append(int(s["tpa"]))
            
            res = {
                "win_rate": round((wins / len(h_list)) * 100, 1),
                "form": form_list,
                "avg_margin": round(sum(margins) / len(margins), 1),
                "ortg": round(sum(ortgs) / len(ortgs), 1) if ortgs else None,
                "drtg": round(sum(drtgs) / len(drtgs), 1) if drtgs else None,
                "pace": round(sum(paces) / len(paces), 1) if paces else None,
                "efg": round(sum(efgs) / len(efgs), 1) if efgs else None,
                "tov": round(sum(tovs) / len(tovs), 1) if tovs else None,
                "orb": round(sum(orbs) / len(orbs), 1) if orbs else None,
                "ftr": round(sum(ftrs) / len(ftrs), 3) if ftrs else None,
                "t3_pct": round((sum(tpms) / sum(tpas)) * 100, 1) if tpas and sum(tpas) > 0 else None
            }
            if res["ortg"] is not None and res["drtg"] is not None:
                res["net_rtg"] = round(res["ortg"] - res["drtg"], 1)
            else:
                res["net_rtg"] = None
            return res

        l5 = get_avg_stats(last_5)
        l10 = get_avg_stats(history[-10:])
        season = get_avg_stats(history)

        # Streak calculation
        streak_val = 0
        streak_char = ''
        if l5["form"]:
            streak_char = l5["form"][-1]
            for char in reversed(l5["form"]):
                if char == streak_char: streak_val += 1
                else: break
        l5_streak = f"{streak_val}{streak_char}" if streak_val > 0 else None

        return {
            "team_id": team_id,
            "date": match_date[:10],
            "venue": venue,
            "rest_days": rest_days,
            "is_b2b": is_b2b,
            "games_in_7_days": games_in_7,
            "l5_ortg": l5["ortg"],
            "l5_drtg": l5["drtg"],
            "l5_net_rtg": l5["net_rtg"],
            "l5_pace": l5["pace"],
            "l5_efg_pct": l5["efg"],
            "l5_tov_pct": l5["tov"],
            "l5_orb_pct": l5["orb"],
            "l5_ftr": l5["ftr"],
            "l5_win_rate": l5["win_rate"],
            "l5_avg_margin": l5["avg_margin"],
            "l5_form": l5["form"],
            "l5_streak": l5_streak,
            "l5_3pt_pct": l5["t3_pct"],
            "l10_ortg": l10["ortg"],
            "l10_drtg": l10["drtg"],
            "l10_net_rtg": l10["net_rtg"],
            "season_ortg": season["ortg"],
            "season_drtg": season["drtg"]
        }

    async def update(self, match_id: int, dry_run: bool = False):
        logger.info(f"📈 Update Rolling for Match {match_id} ({self.sport}) [Dry Run: {dry_run}]")
        
        match = await self.get_match_details(match_id)
        if not match:
            logger.error("❌ Match not found.")
            return

        date_time = match["date_time"]
        teams = [
            {"id": match["home_team_id"], "venue": "home"},
            {"id": match["away_team_id"], "venue": "away"}
        ]
        
        rows_to_upsert = []

        for t in teams:
            tid = t["id"]
            venue = t["venue"]
            
            # Fetch history BEFORE this match
            history = await self.get_team_history(tid, date_time)
            
            # Compute for the specific context (Home/Away) and Global (All)
            contexts = [venue, "all"]
            
            for ctx in contexts:
                filtered_hist = history
                if ctx != "all":
                    filtered_hist = [m for m in history if (m["home_team_id"] == tid) == (ctx == "home")]
                
                if self.sport == "football":
                    row = self.compute_football_stats(tid, date_time, ctx, filtered_hist)
                else:
                    row = self.compute_basketball_stats(tid, date_time, ctx, filtered_hist)
                
                if row:
                    rows_to_upsert.append(row)

        if rows_to_upsert:
            if dry_run:
                logger.info(f"[DRY RUN] Simulation complete. {len(rows_to_upsert)} entries computed.")
                for r in rows_to_upsert:
                    logger.info(f"   - {r['venue']} for team {r['team_id']}: {r}")
            else:
                self.db.upsert(self.rolling_table, rows_to_upsert, on_conflict="team_id,date,venue")
                logger.info(f"✅ Rolling Stats Updated: {len(rows_to_upsert)} entries.")
        else:
            logger.warning("⚠️ No Rolling data generated (missing history?)")

async def main():
    parser = argparse.ArgumentParser(description="Update specific match Rolling Stats")
    parser.add_argument("--sport", choices=["football", "basketball"], required=True)
    parser.add_argument("--match-id", type=int, required=True)
    parser.add_argument("--dry-run", action="store_true", help="Simulate the calculations without writing")
    args = parser.parse_args()
    
    updater = SingleMatchRollingUpdater(args.sport)
    await updater.update(args.match_id, dry_run=args.dry_run)

if __name__ == "__main__":
    asyncio.run(main())
