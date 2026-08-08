"""
BETIX — Compute ELO Ratings
Computes the ELO rating for football teams.
Table cible : analytics.football_team_elo

Formula: K=32, adjusted by goal difference.
Base: 1500 for all teams.

Usage :
    python -m app.services.enrichment.compute_elo
"""

import asyncio
import logging
from collections import defaultdict
from datetime import datetime, timezone, timedelta

from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST

logger = logging.getLogger("betix.enrichment.elo")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")

K_FACTOR = 32
BASE_ELO = 1500.0


def expected_score(elo_a: float, elo_b: float) -> float:
    """Win probability for A based on ELO."""
    return 1.0 / (1.0 + 10 ** ((elo_b - elo_a) / 400.0))


def goal_diff_multiplier(goal_diff: int) -> float:
    """Multiplier based on goal difference (FiveThirtyEight model)."""
    diff = abs(goal_diff)
    if diff <= 1:
        return 1.0
    elif diff == 2:
        return 1.5
    else:
        return (11.0 + diff) / 8.0


async def compute_football_elo():
    """
    Computes the ELO for all football teams.
    TRUNCATE + INSERT since ELO depends on chronological order.
    """
    settings = get_settings()
    db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="analytics")

    logger.info("=== Computing Football ELO ===")

    # Fetch all finished matches ordered chronologically
    matches = db.select_raw(
        "football_matches",
        "status=eq.finished&select=id,home_team_id,away_team_id,home_score,away_score,date_time&order=date_time.asc"
    )
    logger.info(f"Found {len(matches)} finished football matches")

    if not matches:
        logger.warning("No finished matches found. Skipping ELO.")
        return 0

    # Initialize all teams at BASE_ELO
    team_ids = set()
    for m in matches:
        team_ids.add(m["home_team_id"])
        team_ids.add(m["away_team_id"])

    current_elo: dict[int, float] = {tid: BASE_ELO for tid in team_ids}
    elo_history: list[dict] = []  # All snapshots to insert

    # Track ELO 1 month ago for delta calculation
    elo_one_month_ago: dict[int, float] = {tid: BASE_ELO for tid in team_ids}
    last_date_str = ""

    for m in matches:
        home_id = m["home_team_id"]
        away_id = m["away_team_id"]
        home_score = m.get("home_score") or 0
        away_score = m.get("away_score") or 0
        match_date = m["date_time"][:10]  # "YYYY-MM-DD"

        # Actual result (1=win, 0.5=draw, 0=loss from home perspective)
        if home_score > away_score:
            actual_home = 1.0
        elif home_score < away_score:
            actual_home = 0.0
        else:
            actual_home = 0.5

        goal_diff = home_score - away_score
        multiplier = goal_diff_multiplier(goal_diff)

        exp_home = expected_score(current_elo[home_id], current_elo[away_id])
        exp_away = 1.0 - exp_home

        # Update ELOs
        delta_home = K_FACTOR * multiplier * (actual_home - exp_home)
        delta_away = K_FACTOR * multiplier * ((1.0 - actual_home) - exp_away)

        current_elo[home_id] += delta_home
        current_elo[away_id] += delta_away

        # Store snapshot for both teams
        for tid in [home_id, away_id]:
            # Calculate 1-month delta
            elo_1m = round(current_elo[tid] - elo_one_month_ago.get(tid, BASE_ELO), 1)

            elo_history.append({
                "team_id": tid,
                "date": match_date,
                "elo_rating": round(current_elo[tid], 1),
                "elo_change_1m": elo_1m,
            })

        # Update 1-month-ago tracker (simple: reset every 30 days approximately)
        if last_date_str and match_date > last_date_str:
            try:
                cur = datetime.strptime(match_date, "%Y-%m-%d")
                prev = datetime.strptime(last_date_str, "%Y-%m-%d")
                if (cur - prev).days >= 30:
                    elo_one_month_ago = {tid: current_elo.get(tid, BASE_ELO) for tid in team_ids}
            except ValueError:
                pass

        last_date_str = match_date

    if elo_history:
        # Deduplicate: keep only the latest ELO per team per date
        seen = {}
        for row in elo_history:
            key = (row["team_id"], row["date"])
            seen[key] = row  # Last write wins (correct for same-day multi-matches)

        deduped = list(seen.values())

        # Batch upsert in chunks of 500
        chunk_size = 500
        for i in range(0, len(deduped), chunk_size):
            chunk = deduped[i:i + chunk_size]
            db.upsert("football_team_elo", chunk, on_conflict="team_id,date")

        logger.info(f"✅ Football ELO: {len(deduped)} snapshots computed for {len(team_ids)} teams")

    return len(team_ids)


async def main():
    teams = await compute_football_elo()
    logger.info(f"=== ELO Complete: {teams} teams rated ===")


if __name__ == "__main__":
    asyncio.run(main())
