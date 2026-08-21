"""
BETIX — fix_match.py
Force la mise à jour d'un match spécifique via l'API,
puis déclenche la séquence de clôture si le match est terminé.

Usage:
  python scripts/fix_match.py --sport basketball --api-id 470486
  python scripts/fix_match.py --sport football --api-id 123456
"""

import asyncio
import argparse
import logging
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST
from scripts.updates.upsert_fb_data import FBMatchUpserter
from scripts.updates.pipeline_fb import run_fb_pipeline

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s — %(message)s")
logger = logging.getLogger("betix.fix_match")


async def fix_match(sport: str, api_id: int):
    settings = get_settings()
    db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="analytics")
    public_db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

    table = f"{sport}_matches"

    # 1. Lire l'état actuel en DB
    rows = db.select_raw(table, f"select=*&api_id=eq.{api_id}")
    if not rows:
        logger.error(f"Match {sport} api_id={api_id} introuvable dans analytics.{table}")
        return

    db_match = rows[0]
    logger.info(f"DB AVANT: status={db_match.get('status')}, status_short={db_match.get('status_short')}, "
                f"home_score={db_match.get('home_score')}, away_score={db_match.get('away_score')}")

    # 2. Appeler l'API et mettre à jour
    upserter = FBMatchUpserter(db, {
        "football": settings.API_SPORTS_KEY,
        "basketball": settings.API_SPORTS_KEY,
    }, public_db_client=public_db)

    try:
        is_finished = await upserter.process_match(sport, db_match)
        logger.info(f"process_match terminé. is_finished={is_finished}")
    finally:
        await upserter.close()

    # 3. Relire la DB pour confirmer
    rows_after = db.select_raw(table, f"select=status,status_short,home_score,away_score&api_id=eq.{api_id}")
    if rows_after:
        after = rows_after[0]
        logger.info(f"DB APRÈS: status={after.get('status')}, status_short={after.get('status_short')}, "
                    f"home_score={after.get('home_score')}, away_score={after.get('away_score')}")

    # 4. Déclencher la pipeline de clôture si terminé
    if is_finished:
        logger.info(f"Match terminé — lancement de la pipeline de clôture...")
        run_fb_pipeline([{"api_id": api_id, "sport": sport}])
        logger.info("Pipeline terminée.")
    else:
        logger.info("Match non terminé, pas de pipeline de clôture.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="BETIX — Fix a specific match")
    parser.add_argument("--sport", required=True, choices=["football", "basketball"])
    parser.add_argument("--api-id", required=True, type=int)
    args = parser.parse_args()

    asyncio.run(fix_match(args.sport, args.api_id))
