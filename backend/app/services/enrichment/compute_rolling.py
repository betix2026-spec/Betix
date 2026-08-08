"""
BETIX — Compute Rolling Stats (Basic version)
Computes rolling stats (L5/L10) for each team at each match date.
Tables cibles : analytics.football_team_rolling, analytics.basketball_team_rolling

Version "basic": uses scores only (no xG or ortg/drtg).
Will be enriched after Phase 2 (match_stats).

Usage :
    python -m app.services.enrichment.compute_rolling
"""

import asyncio
import logging
from collections import defaultdict
from datetime import datetime, timezone, timedelta

from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST

logger = logging.getLogger("betix.enrichment.rolling")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")


def _compute_football_rolling_for_team(matches: list[dict], team_id: int) -> list[dict]:
    """
    Computes rolling stats for a football team.
    Returns a list of snapshots (one per match date, per venue).
    """
    rows = []

    # Sort by date
    sorted_matches = sorted(matches, key=lambda m: m["date_time"])

    # Window of last N matches
    for window_end in range(len(sorted_matches)):
        m = sorted_matches[window_end]
        match_date = m["date_time"][:10]
        is_home = m["home_team_id"] == team_id

        venue = "home" if is_home else "away"
        my_goals = m.get("home_score", 0) or 0 if is_home else m.get("away_score", 0) or 0
        opp_goals = m.get("away_score", 0) or 0 if is_home else m.get("home_score", 0) or 0

        # Get last 5 matches for this venue + "all"
        for v_filter in [venue, "all"]:
            # Filter relevant prior matches
            if v_filter == "all":
                prior = sorted_matches[:window_end + 1]
            else:
                prior = [x for x in sorted_matches[:window_end + 1]
                         if (x["home_team_id"] == team_id) == (v_filter == "home")]

            last_5 = prior[-5:]
            if len(last_5) < 2:
                continue  # Not enough data

            points = 0
            goals_for = 0
            goals_against = 0
            clean_sheets = 0

            for pm in last_5:
                pm_home = pm["home_team_id"] == team_id
                gf = (pm.get("home_score") or 0) if pm_home else (pm.get("away_score") or 0)
                ga = (pm.get("away_score") or 0) if pm_home else (pm.get("home_score") or 0)
                goals_for += gf
                goals_against += ga
                if ga == 0:
                    clean_sheets += 1
                if gf > ga:
                    points += 3
                elif gf == ga:
                    points += 1

            n = len(last_5)
            rows.append({
                "team_id": team_id,
                "date": match_date,
                "venue": v_filter,
                "l5_points": points,
                "l5_ppm": round(points / n, 2),
                "l5_goals_for": round(goals_for / n, 1),
                "l5_goals_against": round(goals_against / n, 1),
                "l5_clean_sheets": clean_sheets,
                "l5_xg_for": None,  # Populated after Phase 2
                "l5_xg_against": None,
                "l5_possession_avg": None,
                "l5_pass_accuracy": None,
                "l5_shots_avg": None,
            })

    return rows


def _compute_basketball_rolling_for_team(matches: list[dict], team_id: int) -> list[dict]:
    """
    Computes rolling stats for a basketball team.
    Version basique : fatigue metrics only (rest_days, b2b, games_in_7_days).
    ortg/drtg/efg added after Phase 2.
    """
    rows = []
    sorted_matches = sorted(matches, key=lambda m: m["date_time"])

    for idx in range(len(sorted_matches)):
        m = sorted_matches[idx]
        match_date_str = m["date_time"][:10]
        is_home = m["home_team_id"] == team_id
        venue = "home" if is_home else "away"

        try:
            match_date = datetime.strptime(match_date_str, "%Y-%m-%d")
        except ValueError:
            continue

        # Calculate rest_days (days since previous match)
        rest_days = None
        is_b2b = False
        if idx > 0:
            prev_date_str = sorted_matches[idx - 1]["date_time"][:10]
            try:
                prev_date = datetime.strptime(prev_date_str, "%Y-%m-%d")
                rest_days = (match_date - prev_date).days
                is_b2b = rest_days <= 1
            except ValueError:
                pass

        # Games in last 7 days
        seven_days_ago = match_date - timedelta(days=7)
        games_in_7 = sum(
            1 for x in sorted_matches[:idx + 1]
            if datetime.strptime(x["date_time"][:10], "%Y-%m-%d") >= seven_days_ago
        )

        for v_filter in [venue, "all"]:
            rows.append({
                "team_id": team_id,
                "date": match_date_str,
                "venue": v_filter,
                "l5_ortg": None,
                "l5_drtg": None,
                "l5_net_rtg": None,
                "l5_pace": None,
                "l5_efg_pct": None,
                "l10_ortg": None,
                "l10_drtg": None,
                "l10_net_rtg": None,
                "season_ortg": None,
                "season_drtg": None,
                "rest_days": rest_days,
                "is_b2b": is_b2b,
                "games_in_7_days": games_in_7,
            })

    return rows


async def compute_football_rolling():
    settings = get_settings()
    db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="analytics")

    logger.info("=== Computing Football Rolling Stats (Basic) ===")

    matches = db.select_raw(
        "football_matches",
        "status=eq.finished&select=id,home_team_id,away_team_id,home_score,away_score,date_time&order=date_time.asc"
    )
    logger.info(f"Found {len(matches)} finished football matches")

    if not matches:
        return 0

    # Group matches by team
    team_matches = defaultdict(list)
    for m in matches:
        team_matches[m["home_team_id"]].append(m)
        team_matches[m["away_team_id"]].append(m)

    total_rows = 0
    for team_id, t_matches in team_matches.items():
        rows = _compute_football_rolling_for_team(t_matches, team_id)
        if rows:
            # Deduplicate (team_id, date, venue)
            seen = {}
            for r in rows:
                key = (r["team_id"], r["date"], r["venue"])
                seen[key] = r
            deduped = list(seen.values())

            # Batch upsert
            chunk_size = 500
            for i in range(0, len(deduped), chunk_size):
                db.upsert("football_team_rolling", deduped[i:i + chunk_size], on_conflict="team_id,date,venue")
            total_rows += len(deduped)

    logger.info(f"✅ Football Rolling: {total_rows} rows for {len(team_matches)} teams")
    return total_rows


async def compute_basketball_rolling():
    settings = get_settings()
    db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="analytics")

    logger.info("=== Computing Basketball Rolling Stats (Basic) ===")

    matches = db.select_raw(
        "basketball_matches",
        "status=eq.finished&select=id,home_team_id,away_team_id,home_score,away_score,date_time&order=date_time.asc"
    )
    logger.info(f"Found {len(matches)} finished basketball matches")

    if not matches:
        return 0

    team_matches = defaultdict(list)
    for m in matches:
        team_matches[m["home_team_id"]].append(m)
        team_matches[m["away_team_id"]].append(m)

    total_rows = 0
    for team_id, t_matches in team_matches.items():
        rows = _compute_basketball_rolling_for_team(t_matches, team_id)
        if rows:
            seen = {}
            for r in rows:
                key = (r["team_id"], r["date"], r["venue"])
                seen[key] = r
            deduped = list(seen.values())

            chunk_size = 500
            for i in range(0, len(deduped), chunk_size):
                db.upsert("basketball_team_rolling", deduped[i:i + chunk_size], on_conflict="team_id,date,venue")
            total_rows += len(deduped)

    logger.info(f"✅ Basketball Rolling: {total_rows} rows for {len(team_matches)} teams")
    return total_rows


async def main():
    fb = await compute_football_rolling()
    bb = await compute_basketball_rolling()
    logger.info(f"=== Rolling Complete: Football={fb} rows, Basketball={bb} rows ===")


if __name__ == "__main__":
    asyncio.run(main())
