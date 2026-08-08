"""
BETIX — update_tennis_h2h.py
Targeted H2H update for ONE specific tennis match.
Fetches both players for the match, then runs get_H2H for that pair.

Usage:
  python update_tennis_h2h.py --match-id 12345678
"""
import sys, os, logging, argparse, asyncio
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import httpx
from datetime import datetime
from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s — %(message)s")
logger = logging.getLogger("betix.tennis_h2h")


class SingleTennisH2HUpdater:
    def __init__(self):
        settings = get_settings()
        self.api_key = settings.API_TENNIS_KEY
        self.base_url = settings.API_TENNIS_BASE_URL
        self.db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="analytics")

    def _get_player_pair(self, match_api_id: int):
        """Get the internal + API player IDs for a match."""
        match = self.db.select_raw("tennis_matches",
                               f"select=player1_id,player2_id&api_id=eq.{match_api_id}")
        if not match:
            return None
        p1_internal = match[0]["player1_id"]
        p2_internal = match[0]["player2_id"]

        players = self.db.select_raw("players",
                                  f"select=id,api_id&id=in.({p1_internal},{p2_internal})")
        id_to_api = {p["id"]: p["api_id"] for p in players}

        return {
            "p_a": min(p1_internal, p2_internal),
            "p_b": max(p1_internal, p2_internal),
            "api_a": id_to_api.get(min(p1_internal, p2_internal)),
            "api_b": id_to_api.get(max(p1_internal, p2_internal)),
        }

    def _build_h2h_row(self, h2h_matches, pair):
        total_wins_a = 0
        total_wins_b = 0
        last_date = None
        last_winner = None
        last_score = None

        for m in h2h_matches:
            winner = m.get("event_winner")
            p1_api = int(m.get("first_player_key", 0))
            if winner == "First Player":
                winner_api = p1_api
            elif winner == "Second Player":
                winner_api = int(m.get("second_player_key", 0))
            else:
                continue

            if winner_api == pair["api_a"]:
                total_wins_a += 1
            elif winner_api == pair["api_b"]:
                total_wins_b += 1

            event_date = m.get("event_date")
            if event_date and (last_date is None or event_date > last_date):
                last_date = event_date
                last_winner = pair["p_a"] if winner_api == pair["api_a"] else pair["p_b"]
                score = m.get("event_final_result", "")
                last_score = score if score != "-" else None

        return {
            "player_a_id": pair["p_a"],
            "player_b_id": pair["p_b"],
            "total_wins_a": total_wins_a,
            "total_wins_b": total_wins_b,
            "clay_wins_a": 0, "clay_wins_b": 0,
            "hard_wins_a": 0, "hard_wins_b": 0,
            "grass_wins_a": 0, "grass_wins_b": 0,
            "indoor_wins_a": 0, "indoor_wins_b": 0,
            "last_meeting_date": last_date,
            "last_winner_id": last_winner,
            "last_score": last_score,
            "updated_at": datetime.utcnow().isoformat() + "Z",
        }

    async def update(self, match_api_id: int):
        """Update H2H for a single tennis match."""
        logger.info(f"🎾 Update Tennis H2H for match {match_api_id}")

        pair = self._get_player_pair(match_api_id)
        if not pair or not pair["api_a"] or not pair["api_b"]:
            logger.error("❌ Could not resolve player pair.")
            return

        logger.info(f"   Players: {pair['p_a']} vs {pair['p_b']} (API: {pair['api_a']} vs {pair['api_b']})")

        # Fetch H2H from API
        with httpx.Client(timeout=15.0) as client:
            resp = client.get(self.base_url, params={
                "method": "get_H2H",
                "APIkey": self.api_key,
                "first_player_key": str(pair["api_a"]),
                "second_player_key": str(pair["api_b"]),
            })
            resp.raise_for_status()
            data = resp.json()

        h2h = data.get("result", {}).get("H2H", [])
        row = self._build_h2h_row(h2h, pair)

        self.db.upsert("tennis_h2h", [row], on_conflict="player_a_id,player_b_id")
        logger.info(f"✅ H2H updated: {row['total_wins_a']}-{row['total_wins_b']}, last: {row['last_meeting_date']}")


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--match-id", type=int, required=True, help="API event_key")
    args = parser.parse_args()
    updater = SingleTennisH2HUpdater()
    await updater.update(args.match_id)

if __name__ == "__main__":
    asyncio.run(main())
