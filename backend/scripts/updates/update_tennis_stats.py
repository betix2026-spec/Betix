"""
BETIX — update_tennis_stats.py
Targeted stats update for ONE specific tennis match.
Fetches the match stats via get_fixtures (event_key) and upserts them into tennis_match_stats.

Usage:
  python update_tennis_stats.py --match-id 12345678
"""
import sys, os, logging, argparse, asyncio
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import httpx
from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s — %(message)s")
logger = logging.getLogger("betix.tennis_stats")

# Stat name → DB column mapping
STAT_MAP = {
    "Aces":                    ("aces",                "int"),
    "Double Faults":           ("double_faults",       "int"),
    "1st serve percentage":    ("first_serve_pct",     "pct"),
    "1st serve points won":    ("first_serve_won_pct", "pct"),
    "2nd serve points won":    ("second_serve_won_pct","pct"),
    "Break Points Saved":      ("bp_saved_pct",        "pct"),
    "Break Points Converted":  ("bp_converted_pct",    "pct"),
    "Total Points Won":        ("total_points_won",    "won"),
    "Return Points Won":       ("return_won_pct",      "pct"),
    "Service games won":       ("service_games_held",  "won"),
    "Return games won":        ("return_games_won",    "won"),
}

ALL_COLS = [col for col, _ in STAT_MAP.values()]


def _parse_pct(val):
    try: return float(str(val).replace("%", "").strip())
    except: return None

def _parse_int(val):
    try: return int(str(val).replace("%", "").strip())
    except: return None


class SingleTennisStatsUpdater:
    def __init__(self):
        settings = get_settings()
        self.api_key = settings.API_TENNIS_KEY
        self.base_url = settings.API_TENNIS_BASE_URL
        self.db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="analytics")
        self._player_cache = {}

    def _load_player_cache(self):
        if not self._player_cache:
            players = self.db.select("players", "id,api_id", {})
            self._player_cache = {p["api_id"]: p["id"] for p in players}

    def _extract_player_stats(self, statistics, player_key):
        row = {col: None for col in ALL_COLS}
        for stat in statistics:
            if stat.get("player_key") != player_key: continue
            if stat.get("stat_period") != "match": continue
            name = stat.get("stat_name", "")
            if name not in STAT_MAP: continue
            col, kind = STAT_MAP[name]
            if kind == "int":   row[col] = _parse_int(stat.get("stat_value"))
            elif kind == "pct": row[col] = _parse_pct(stat.get("stat_value"))
            elif kind == "won": row[col] = _parse_int(stat.get("stat_won"))
        return row if any(v is not None for v in row.values()) else None

    async def update(self, match_api_id: int):
        """Update stats for a single tennis match by its API ID (event_key)."""
        logger.info(f"🎾 Update Tennis Stats for match {match_api_id}")
        self._load_player_cache()

        # Get the internal match ID and date
        match_rows = self.db.select_raw("tennis_matches", f"select=id,date_time&api_id=eq.{match_api_id}")
        if not match_rows:
            logger.error(f"❌ Match {match_api_id} not found in DB.")
            return
        match_internal_id = match_rows[0]["id"]
        
        # API requires date_start and date_stop even for event_id lookups
        match_date = match_rows[0]["date_time"][:10] if match_rows[0].get("date_time") else datetime.utcnow().strftime("%Y-%m-%d")

        # Fetch fixture from API
        with httpx.Client(timeout=15.0) as client:
            resp = client.get(self.base_url, params={
                "method": "get_fixtures",
                "APIkey": self.api_key,
                "event_key": str(match_api_id),
                "date_start": match_date,
                "date_stop": match_date
            })
            resp.raise_for_status()
            data = resp.json()

        results = data.get("result", [])
        if not results:
            logger.warning(f"⚠️ No fixture data from API for match {match_api_id}.")
            return

        # Correctly find the match in the list (API might return multiples for the day)
        match_found = next((m for m in results if str(m.get("event_key")) == str(match_api_id)), None)
        
        if not match_found:
            logger.warning(f"⚠️ Match {match_api_id} not found in API results list.")
            return

        fix = match_found
        stats_arr = fix.get("statistics", [])
        if not stats_arr:
            logger.warning(f"⚠️ No statistics in fixture response for match {match_api_id}.")
            return

        p1_api = int(fix.get("first_player_key", 0))
        p2_api = int(fix.get("second_player_key", 0))

        rows = []
        for p_api in [p1_api, p2_api]:
            p_internal = self._player_cache.get(p_api)
            if not p_internal:
                logger.warning(f"⚠️ Player API {p_api} not in DB.")
                continue
            row = self._extract_player_stats(stats_arr, p_api)
            if row:
                row["match_id"] = match_internal_id
                row["player_id"] = p_internal
                rows.append(row)

        if rows:
            self.db.upsert("tennis_match_stats", rows, on_conflict="match_id,player_id")
            logger.info(f"✅ Stats updated for {len(rows)} players.")
        else:
            logger.warning("⚠️ No stats rows generated.")


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--match-id", type=int, required=True, help="API event_key")
    args = parser.parse_args()
    updater = SingleTennisStatsUpdater()
    await updater.update(args.match_id)

if __name__ == "__main__":
    asyncio.run(main())
