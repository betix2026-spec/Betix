"""
BETIX — Compute Head-to-Head (H2H)
Computes head-to-head records from finished matches.
Tables cibles : analytics.football_h2h, analytics.basketball_h2h

Usage :
    python -m app.services.enrichment.compute_h2h
"""

import asyncio
import logging
from collections import defaultdict
from datetime import datetime, timezone, timedelta

from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST

logger = logging.getLogger("betix.enrichment.h2h")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")


async def compute_football_h2h():
    """
    Calcule les confrontations directes football.
    Convention : team_a_id < team_b_id (contrainte DB).
    """
    settings = get_settings()
    db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="analytics")

    logger.info("=== Computing Football H2H ===")

    # Fetch all finished football matches
    matches = db.select_raw("football_matches", "status=eq.finished&select=id,home_team_id,away_team_id,home_score,away_score,date_time&order=date_time.asc")
    logger.info(f"Found {len(matches)} finished football matches")

    if not matches:
        logger.warning("No finished football matches found. Skipping H2H.")
        return 0

    # Group by pair (sorted IDs)
    pairs = defaultdict(list)
    for m in matches:
        a = min(m["home_team_id"], m["away_team_id"])
        b = max(m["home_team_id"], m["away_team_id"])
        pairs[(a, b)].append(m)

    h2h_rows = []
    for (team_a, team_b), match_list in pairs.items():
        a_wins = 0
        b_wins = 0
        draws = 0
        total_goals_a = 0
        total_goals_b = 0
        results = []  # From team_a perspective

        for m in match_list:
            hs = m.get("home_score") or 0
            as_ = m.get("away_score") or 0

            # Determine which is team_a and team_b in this match
            if m["home_team_id"] == team_a:
                goals_a, goals_b = hs, as_
            else:
                goals_a, goals_b = as_, hs

            total_goals_a += goals_a
            total_goals_b += goals_b

            if goals_a > goals_b:
                a_wins += 1
                results.append("W")
            elif goals_a < goals_b:
                b_wins += 1
                results.append("L")
            else:
                draws += 1
                results.append("D")

        total = len(match_list)
        last_5 = results[-5:] if len(results) >= 5 else results

        h2h_rows.append({
            "team_a_id": team_a,
            "team_b_id": team_b,
            "total_matches": total,
            "team_a_wins": a_wins,
            "draws": draws,
            "team_b_wins": b_wins,
            "avg_goals_a": round(total_goals_a / total, 1) if total > 0 else 0,
            "avg_goals_b": round(total_goals_b / total, 1) if total > 0 else 0,
            "last_5_results": last_5,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })

    if h2h_rows:
        # Batch upsert (PostgREST can handle it)
        db.upsert("football_h2h", h2h_rows, on_conflict="team_a_id,team_b_id")
        logger.info(f"✅ Football H2H: {len(h2h_rows)} pairs computed and upserted")
    
    return len(h2h_rows)


async def compute_basketball_h2h():
    """
    Calcule les confrontations directes basketball (par saison).
    Convention : team_a_id < team_b_id (contrainte DB).
    """
    settings = get_settings()
    db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="analytics")

    logger.info("=== Computing Basketball H2H ===")

    matches = db.select_raw("basketball_matches", "status=eq.finished&select=id,home_team_id,away_team_id,home_score,away_score,date_time&order=date_time.asc")
    logger.info(f"Found {len(matches)} finished basketball matches")

    if not matches:
        logger.warning("No finished basketball matches found. Skipping H2H.")
        return 0

    # Group by (pair, season)
    from app.services.ingestion.constants import CURRENT_SEASON
    pairs = defaultdict(list)
    for m in matches:
        a = min(m["home_team_id"], m["away_team_id"])
        b = max(m["home_team_id"], m["away_team_id"])
        pairs[(a, b, CURRENT_SEASON)].append(m)

    h2h_rows = []
    for (team_a, team_b, season), match_list in pairs.items():
        a_wins = 0
        b_wins = 0
        total_margin = 0
        last_results = []

        for m in match_list:
            hs = m.get("home_score") or 0
            as_ = m.get("away_score") or 0

            if m["home_team_id"] == team_a:
                margin = hs - as_
            else:
                margin = as_ - hs

            total_margin += margin
            if margin > 0:
                a_wins += 1
            else:
                b_wins += 1

            dt = m.get("date_time", "")
            score_str = f"{hs}-{as_}"
            winner = "team_a" if margin > 0 else "team_b"
            last_results.append({"date": dt[:10] if dt else "", "score": score_str, "winner": winner})

        total = len(match_list)
        h2h_rows.append({
            "team_a_id": team_a,
            "team_b_id": team_b,
            "season": season,
            "games_played": total,
            "team_a_wins": a_wins,
            "avg_margin": round(total_margin / total, 1) if total > 0 else 0,
            "last_results": last_results[-5:],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })

    if h2h_rows:
        db.upsert("basketball_h2h", h2h_rows, on_conflict="team_a_id,team_b_id,season")
        logger.info(f"✅ Basketball H2H: {len(h2h_rows)} pairs computed and upserted")

    return len(h2h_rows)


async def main():
    fb = await compute_football_h2h()
    bb = await compute_basketball_h2h()
    logger.info(f"=== H2H Complete: Football={fb} pairs, Basketball={bb} pairs ===")


if __name__ == "__main__":
    asyncio.run(main())
