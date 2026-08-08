"""
BETIX — update_match_elo.py
Targeted ELO update for ONE specific match.
Recomputes the ELO rating for both teams involved after the match result.

0 API calls — everything is computed from the database.

ELO parameters (consistent with engine/compute_elo.py):
  - Football  : K=30, base=1500
  - Basketball: K=20, base=1500
  - No goal-diff multiplier

Usage:
    python update_match_elo.py --sport football --match-id 123456
    python update_match_elo.py --sport basketball --match-id 456789
    python update_match_elo.py --sport football --match-id 123456 --dry-run
"""

import asyncio
import argparse
import logging
import sys
import os
from datetime import timedelta

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s — %(message)s")
logger = logging.getLogger("betix.update_elo")

K_FACTOR = {"football": 30, "basketball": 20}
DEFAULT_ELO = 1500.0


def expected_score(rating_a: float, rating_b: float) -> float:
    return 1 / (1 + 10 ** ((rating_b - rating_a) / 400))


def compute_new_elo(rating_a: float, rating_b: float, actual_a: float, k: int) -> tuple[float, float]:
    exp_a = expected_score(rating_a, rating_b)
    change = k * (actual_a - exp_a)
    return rating_a + change, rating_b - change


class SingleMatchEloUpdater:
    def __init__(self, sport: str):
        self.sport = sport
        settings = get_settings()
        self.db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="analytics")
        self.match_table = f"{sport}_matches"
        self.elo_table = f"{sport}_team_elo"
        self.k = K_FACTOR[sport]

    def get_match_details(self, match_id: int) -> dict | None:
        rows = self.db.select(
            self.match_table,
            "id,api_id,home_team_id,away_team_id,home_score,away_score,date_time,status",
            {"api_id": match_id}
        )
        return rows[0] if rows else None

    def get_current_elo(self, team_id: int) -> float:
        rows = self.db.select_raw(
            self.elo_table,
            f"select=elo_rating&team_id=eq.{team_id}&order=date.desc&limit=1"
        )
        if rows:
            return float(rows[0]["elo_rating"])
        return DEFAULT_ELO

    def get_elo_1m_ago(self, team_id: int, match_date: str) -> float | None:
        from datetime import datetime
        dt = datetime.strptime(match_date[:10], "%Y-%m-%d")
        date_1m_ago = (dt - timedelta(days=30)).strftime("%Y-%m-%d")

        rows = self.db.select_raw(
            self.elo_table,
            f"select=elo_rating&team_id=eq.{team_id}&date=lte.{date_1m_ago}&order=date.desc&limit=1"
        )
        if rows:
            return float(rows[0]["elo_rating"])
        return None

    def update(self, match_id: int, dry_run: bool = False):
        logger.info(f"📊 Update ELO for Match {match_id} ({self.sport}) [Dry Run: {dry_run}]")

        match = self.get_match_details(match_id)
        if not match:
            logger.error(f"❌ Match {match_id} not found in {self.match_table}")
            return

        if match["status"] != "finished":
            logger.warning(f"⚠️ Match {match_id} is not finished (status={match['status']}). ELO not computed.")
            return

        home_id = match["home_team_id"]
        away_id = match["away_team_id"]
        h_score = match["home_score"]
        a_score = match["away_score"]
        match_date = match["date_time"]

        if h_score is None or a_score is None:
            logger.error(f"❌ Missing scores for match {match_id}.")
            return

        if h_score > a_score:
            actual_home = 1.0
        elif h_score == a_score:
            actual_home = 0.5
        else:
            actual_home = 0.0

        elo_home = self.get_current_elo(home_id)
        elo_away = self.get_current_elo(away_id)

        new_home, new_away = compute_new_elo(elo_home, elo_away, actual_home, self.k)

        elo_1m_home = self.get_elo_1m_ago(home_id, match_date)
        elo_1m_away = self.get_elo_1m_ago(away_id, match_date)

        change_1m_home = round(new_home - elo_1m_home, 1) if elo_1m_home is not None else round(new_home - elo_home, 1)
        change_1m_away = round(new_away - elo_1m_away, 1) if elo_1m_away is not None else round(new_away - elo_away, 1)

        date_str = match_date[:10]

        rows = [
            {
                "team_id": home_id,
                "date": date_str,
                "elo_rating": round(new_home, 1),
                "elo_change_1m": change_1m_home,
            },
            {
                "team_id": away_id,
                "date": date_str,
                "elo_rating": round(new_away, 1),
                "elo_change_1m": change_1m_away,
            },
        ]

        logger.info(f"   Home (team_id={home_id}): {elo_home:.1f} → {new_home:.1f} (delta: {new_home - elo_home:+.1f})")
        logger.info(f"   Away (team_id={away_id}): {elo_away:.1f} → {new_away:.1f} (delta: {new_away - elo_away:+.1f})")
        logger.info(f"   Change 1M — Home: {change_1m_home:+.1f}, Away: {change_1m_away:+.1f}")

        if dry_run:
            logger.info(f"[DRY RUN] 2 entries computed, nothing written.")
        else:
            self.db.upsert(self.elo_table, rows, on_conflict="team_id,date")
            logger.info(f"✅ ELO updated for both teams.")


async def main():
    parser = argparse.ArgumentParser(description="Update ELO for a specific match")
    parser.add_argument("--sport", choices=["football", "basketball"], required=True)
    parser.add_argument("--match-id", type=int, required=True)
    parser.add_argument("--dry-run", action="store_true", help="Simulate without writing")
    args = parser.parse_args()

    updater = SingleMatchEloUpdater(args.sport)
    updater.update(args.match_id, dry_run=args.dry_run)


if __name__ == "__main__":
    asyncio.run(main())
