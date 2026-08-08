"""
BETIX — Compute Referee Stats
Aggregates referee stats from finished football matches.
Table cible : analytics.football_referee_stats

Usage :
    python -m app.services.enrichment.compute_referee_stats
"""

import asyncio
import logging
from collections import defaultdict
from datetime import datetime, timezone

from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST
from app.services.ingestion.constants import CURRENT_SEASON

logger = logging.getLogger("betix.enrichment.referee")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")


async def compute_referee_stats():
    """
    Aggregates referee stats by combining football_matches (referee_name)
    with football_match_stats (yellow_cards, red_cards, fouls).
    """
    settings = get_settings()
    db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="analytics")

    logger.info("=== Computing Referee Stats ===")

    # Fetch finished matches with referee
    matches = db.select_raw(
        "football_matches",
        "status=eq.finished&referee_name=not.is.null&select=id,referee_name&order=date_time.asc"
    )
    logger.info(f"Found {len(matches)} finished matches with referee data")

    if not matches:
        logger.warning("No matches with referee data found.")
        return 0

    # Fetch all match stats (for cards/fouls)
    all_stats = db.select_raw("football_match_stats", "select=match_id,yellow_cards,red_cards,fouls")
    stats_by_match = defaultdict(list)
    for s in all_stats:
        stats_by_match[s["match_id"]].append(s)

    # Group by referee
    referee_data = defaultdict(lambda: {
        "matches_officiated": 0,
        "total_yellow": 0,
        "total_red": 0,
        "total_fouls": 0,
        "total_penalties": 0,
    })

    for m in matches:
        ref_name = m["referee_name"]
        if not ref_name or ref_name.strip() == "":
            continue

        ref_name = ref_name.strip()
        rd = referee_data[ref_name]
        rd["matches_officiated"] += 1

        # Get stats for this match (sum both teams)
        match_stats = stats_by_match.get(m["id"], [])
        for ms in match_stats:
            rd["total_yellow"] += ms.get("yellow_cards") or 0
            rd["total_red"] += ms.get("red_cards") or 0
            rd["total_fouls"] += ms.get("fouls") or 0

    # Build rows
    ref_rows = []
    for ref_name, rd in referee_data.items():
        n = rd["matches_officiated"]
        if n == 0:
            continue
        ref_rows.append({
            "referee_name": ref_name,
            "season": CURRENT_SEASON,
            "matches_officiated": n,
            "avg_yellow_cards": round(rd["total_yellow"] / n, 1),
            "avg_red_cards": round(rd["total_red"] / n, 2),
            "avg_fouls": round(rd["total_fouls"] / n, 1),
            "avg_penalties": 0,
        })

    if ref_rows:
        db.upsert("football_referee_stats", ref_rows, on_conflict="referee_name,season")
        logger.info(f"✅ Referee Stats: {len(ref_rows)} referees computed")

    return len(ref_rows)


async def main():
    count = await compute_referee_stats()
    logger.info(f"=== Referee Stats Complete: {count} referees ===")


if __name__ == "__main__":
    asyncio.run(main())
