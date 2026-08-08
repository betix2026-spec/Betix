"""
BETIX — update_tennis_rankings.py
Updates ATP & WTA rankings from the api-tennis.com API.

Fetches standings for each tour, upserts players into analytics.players
and rankings into analytics.tennis_rankings.

Recommended frequency: 1x/week (ATP/WTA rankings change on Mondays).
0 local computation — everything comes from the API.

Usage:
    python update_tennis_rankings.py
    python update_tennis_rankings.py --top 200
    python update_tennis_rankings.py --tour ATP
    python update_tennis_rankings.py --dry-run
"""

import asyncio
import argparse
import logging
import sys
import os
import httpx
from datetime import date, datetime

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s — %(message)s")
logger = logging.getLogger("betix.update_rankings")

TOURS = ["ATP", "WTA"]
TOUR_GENDER = {"ATP": "M", "WTA": "F"}
MOVEMENT_MAP = {"up": 1, "down": -1, "same": 0}


class TennisRankingsUpdater:
    def __init__(self, top: int = 100, tours: list[str] | None = None, dry_run: bool = False):
        settings = get_settings()
        self.api_key = settings.API_TENNIS_KEY
        self.base_url = settings.API_TENNIS_BASE_URL
        self.db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="analytics")
        self.top = top
        self.tours = tours or TOURS
        self.dry_run = dry_run
        self.report = {"players": 0, "rankings": 0, "errors": 0}

    async def fetch_standings(self, tour: str) -> list[dict]:
        params = {
            "method": "get_standings",
            "APIkey": self.api_key,
            "event_type": tour,
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(self.base_url, params=params)
            resp.raise_for_status()
            data = resp.json()

        if not data.get("success"):
            logger.error(f"API Error for {tour}: {data}")
            return []

        results = data.get("result", [])
        logger.info(f"{tour}: {len(results)} players in standings")
        return results

    async def fetch_player_profile(self, player_key: str) -> dict | None:
        params = {
            "method": "get_players",
            "APIkey": self.api_key,
            "player_key": player_key,
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                resp = await client.get(self.base_url, params=params)
                resp.raise_for_status()
                data = resp.json()
                if data.get("success") and data.get("result"):
                    return data["result"][0]
            except Exception as e:
                logger.warning(f"Profile fetch failed for {player_key}: {e}")
        return None

    def _map_player(self, standing: dict, tour: str, profile: dict | None) -> dict:
        country = profile.get("player_country") if profile else None
        logo_url = profile.get("player_logo") if profile else None
        plays = profile.get("player_plays") if profile else None

        height, weight, turned_pro, birthdate = None, None, None, None

        if profile:
            try:
                h = profile.get("player_height", "").replace("cm", "").strip()
                if h: height = int(h)
            except ValueError: pass
            try:
                w = profile.get("player_weight", "").replace("kg", "").replace(")", "").strip()
                if w: weight = int(w)
            except ValueError: pass
            try:
                tp = profile.get("player_pro", "").strip()
                if tp: turned_pro = int(tp)
            except ValueError: pass
            bday_raw = profile.get("player_bday", "").strip()
            if bday_raw:
                for fmt in ("%d.%m.%Y", "%Y-%m-%d"):
                    try:
                        birthdate = datetime.strptime(bday_raw, fmt).date().isoformat()
                        break
                    except ValueError:
                        continue

        return {
            "api_id": int(standing["player_key"]),
            "name": standing.get("player", "Unknown"),
            "gender": TOUR_GENDER[tour],
            "country": country,
            "birthdate": birthdate,
            "height_cm": height,
            "weight_kg": weight,
            "plays": plays,
            "turned_pro": turned_pro,
            "logo_url": logo_url,
        }

    def _map_ranking(self, standing: dict, tour: str, internal_player_id: int) -> dict:
        movement_text = standing.get("movement", "same")
        rank_change = MOVEMENT_MAP.get(movement_text, 0)
        return {
            "player_id": internal_player_id,
            "date": date.today().isoformat(),
            "rank": int(standing["place"]),
            "points": int(standing.get("points", 0)),
            "rank_change_1m": rank_change,
        }

    async def run(self):
        if not self.api_key:
            logger.error("API_TENNIS_KEY not configured.")
            return self.report

        logger.info(f"Updating tennis rankings — Tours: {self.tours}, Top {self.top}, Dry Run: {self.dry_run}")

        for tour in self.tours:
            logger.info(f"--- {tour} ---")
            standings = await self.fetch_standings(tour)
            if not standings:
                continue

            standings = standings[:self.top]

            for i, s in enumerate(standings):
                if not s.get("player_key"):
                    continue

                player_api_id = int(s["player_key"])
                player_name = s.get("player", "Unknown")

                profile = await self.fetch_player_profile(s["player_key"])
                player_record = self._map_player(s, tour, profile)

                if not self.dry_run:
                    try:
                        self.db.upsert("players", [player_record], on_conflict="api_id")
                    except Exception:
                        existing = self.db.select("players", "id", {"api_id": player_api_id})
                        if not existing:
                            logger.error(f"Could not upsert player {player_name}")
                            self.report["errors"] += 1
                            continue

                existing = self.db.select("players", "id", {"api_id": player_api_id})
                if not existing:
                    logger.warning(f"Internal ID not found for {player_name}")
                    self.report["errors"] += 1
                    continue

                internal_id = existing[0]["id"]
                ranking_record = self._map_ranking(s, tour, internal_id)

                if not self.dry_run:
                    try:
                        self.db.upsert("tennis_rankings", [ranking_record], on_conflict="player_id,date")
                    except Exception as e:
                        logger.error(f"Error upserting ranking for {player_name}: {e}")
                        self.report["errors"] += 1
                        continue

                self.report["players"] += 1
                self.report["rankings"] += 1

                if (i + 1) % 50 == 0:
                    logger.info(f"  {i + 1}/{len(standings)} players processed")

            logger.info(f"{tour} complete: {len(standings)} players processed")

        logger.info(f"Result: {self.report}")
        return self.report


async def main():
    parser = argparse.ArgumentParser(description="Update tennis ATP/WTA rankings")
    parser.add_argument("--top", type=int, default=100, help="Number of players per tour (default: 100)")
    parser.add_argument("--tour", choices=["ATP", "WTA"], default=None, help="Specific tour (default: both)")
    parser.add_argument("--dry-run", action="store_true", help="Simulate without writing")
    args = parser.parse_args()

    tours = [args.tour] if args.tour else None
    updater = TennisRankingsUpdater(top=args.top, tours=tours, dry_run=args.dry_run)
    await updater.run()


if __name__ == "__main__":
    asyncio.run(main())
