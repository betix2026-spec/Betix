"""
BETIX — update_tennis_rolling.py
Targeted Rolling Stats update for ONE specific tennis match.
Recomputes stats (L5, L10, Season, Fatigue) for both players as of the match date.

Usage:
  python update_tennis_rolling.py --match-id 12345678
"""
import sys, os, logging, argparse, asyncio
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from datetime import datetime
from statistics import mean

from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s — %(message)s")
logger = logging.getLogger("betix.tennis_rolling")

L5 = 5
L10 = 10


def safe_mean(values, default=None):
    clean = [v for v in values if v is not None]
    return round(mean(clean), 1) if clean else default

def safe_pct(wins, total):
    return round(wins / total * 100, 1) if total > 0 else None

def parse_date(dt_str):
    if not dt_str: return None
    try: return datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
    except: return None


class SingleTennisRollingUpdater:
    def __init__(self):
        settings = get_settings()
        self.db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="analytics")

    def _get_match(self, match_api_id: int):
        rows = self.db.select_raw("tennis_matches",
            f"select=id,api_id,date_time,player1_id,player2_id,winner_id,sets_played&api_id=eq.{match_api_id}")
        return rows[0] if rows else None

    def _get_player_history(self, player_id: int, before_date: str, limit: int = 20):
        """Get the last N finished matches for a player BEFORE a given date."""
        # Strip timezone offset to avoid URL encoding issues with '+'
        clean_date = before_date.replace("+00:00", "Z").replace("+01:00", "Z").replace("+02:00", "Z")
        rows = self.db.select_raw("tennis_matches",
            f"select=id,date_time,player1_id,player2_id,winner_id,sets_played"
            f"&status=eq.finished"
            f"&date_time=lt.{clean_date}"
            f"&or=(player1_id.eq.{player_id},player2_id.eq.{player_id})"
            f"&order=date_time.desc"
            f"&limit={limit}")
        return list(reversed(rows))  # chronological order

    def _get_stats_for_matches(self, match_ids: list, player_id: int):
        if not match_ids: return {}
        ids_str = ",".join(str(m) for m in match_ids)
        rows = self.db.select_raw("tennis_match_stats",
            f"select=match_id,aces,first_serve_pct,first_serve_won_pct,"
            f"bp_saved_pct,return_won_pct,bp_converted_pct"
            f"&player_id=eq.{player_id}"
            f"&match_id=in.({ids_str})")
        return {r["match_id"]: r for r in rows}

    def _compute_rolling(self, player_id, match_date, history, stats_idx):
        """Compute rolling stats for a single player at a given date."""
        w5 = history[-L5:] if len(history) >= L5 else history
        w10 = history[-L10:] if len(history) >= L10 else history
        season = history

        # Win %
        l5_win = safe_pct(sum(1 for m in w5 if m["winner_id"] == player_id), len(w5))
        l10_win = safe_pct(sum(1 for m in w10 if m["winner_id"] == player_id), len(w10))
        season_win = safe_pct(sum(1 for m in season if m["winner_id"] == player_id), len(season))

        # L10 service & return stats
        aces_list, fsp_list, fsw_list = [], [], []
        bps_list, rwp_list, bpc_list = [], [], []

        for m in w10:
            st = stats_idx.get(m["id"])
            if not st: continue
            aces_list.append(st.get("aces"))
            fsp_list.append(st.get("first_serve_pct"))
            fsw_list.append(st.get("first_serve_won_pct"))
            bps_list.append(st.get("bp_saved_pct"))
            rwp_list.append(st.get("return_won_pct"))
            bpc_list.append(st.get("bp_converted_pct"))

        # Fatigue
        days_since = None
        if len(history) >= 1:
            prev_dt = parse_date(history[-1]["date_time"])
            curr_dt = parse_date(match_date)
            if prev_dt and curr_dt:
                days_since = (curr_dt - prev_dt).days

        curr_dt = parse_date(match_date)
        sets_l7 = 0
        if curr_dt:
            for m in history:
                m_dt = parse_date(m["date_time"])
                if m_dt and 0 < (curr_dt - m_dt).days <= 7:
                    sets_l7 += m.get("sets_played") or 0

        fatigue = 0.0
        if sets_l7 > 0:
            fatigue += min(sets_l7 / 15, 1.0) * 50
        if days_since is not None and days_since < 3:
            fatigue += (3 - days_since) * 16.7

        return {
            "player_id": player_id,
            "surface": "all",
            "date": match_date[:10],
            "l5_win_pct": l5_win,
            "l10_win_pct": l10_win,
            "season_win_pct": season_win,
            "l10_aces_avg": safe_mean(aces_list),
            "l10_first_serve_pct": safe_mean(fsp_list),
            "l10_first_serve_won": safe_mean(fsw_list),
            "l10_bp_saved_pct": safe_mean(bps_list),
            "l10_return_won_pct": safe_mean(rwp_list),
            "l10_bp_converted_pct": safe_mean(bpc_list),
            "days_since_last_match": int(days_since) if days_since is not None else None,
            "sets_played_l7": int(sets_l7),
            "minutes_played_l7": None,
            "fatigue_score": int(min(fatigue, 100)),
        }

    async def update(self, match_api_id: int):
        """Update rolling stats for both players in a single tennis match."""
        logger.info(f"🎾 Update Tennis Rolling for match {match_api_id}")

        match = self._get_match(match_api_id)
        if not match:
            logger.error("❌ Match not found in DB.")
            return

        match_date = match["date_time"]
        player_ids = [match["player1_id"], match["player2_id"]]

        rows = []
        for pid in player_ids:
            history = self._get_player_history(pid, match_date)
            if not history:
                logger.info(f"   ⚠️ No history for player {pid}, skipping.")
                continue

            match_ids = [m["id"] for m in history]
            stats_idx = self._get_stats_for_matches(match_ids, pid)
            row = self._compute_rolling(pid, match_date, history, stats_idx)
            rows.append(row)

        if rows:
            self.db.upsert("tennis_player_rolling", rows, on_conflict="player_id,surface,date")
            logger.info(f"✅ Rolling updated for {len(rows)} players.")
        else:
            logger.warning("⚠️ No rolling data generated.")


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--match-id", type=int, required=True, help="API event_key")
    args = parser.parse_args()
    updater = SingleTennisRollingUpdater()
    await updater.update(args.match_id)

if __name__ == "__main__":
    asyncio.run(main())
