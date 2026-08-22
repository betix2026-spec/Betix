"""
BETIX — orchestrator_data.py
The "Secondary Brain" dedicated to background data.

Frequencies:
- Match ingestion (MatchDiscoverer): every 6 hours (before odds)
- Odds ingestion (OddsIngester): every 6 hours
- Cleanup and stats (DailyMatchOrchestrator): every 8 hours
"""

import asyncio
import logging
import sys
import os
from datetime import datetime, timezone

# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

# Import logic from scripts
from scripts.updates.process_daily_matches import DailyMatchOrchestrator
from scripts.updates.upsert_odds import OddsIngester
from scripts.updates.discover_matches import MatchDiscoverer
from scripts.updates.update_tennis_rankings import TennisRankingsUpdater
from app.services.config_reader import ConfigReader
from app.services.ingestion.football_client import FootballClient
from app.services.ingestion.basketball_client import BasketballClient

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s -- %(message)s",
    force=True,
    handlers=[
        logging.FileHandler("automation_data.log", encoding='utf-8'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("betix.orchestrator_data")

# Defaults (fallback if the DB is unreachable)
DEFAULT_SLEEP_INTERVAL = 60
DEFAULT_DISCOVERY_EVERY_N = 360
DEFAULT_CLEANUP_EVERY_N = 480
DEFAULT_DISCOVERY_DAYS = 10


def load_data_config() -> dict:
    """Loads the data config from system_config."""
    try:
        reader = ConfigReader()
        return {
            "enabled": reader.get_bool("orch_data.enabled", True),
            "sleep_interval_s": reader.get_int("orch_data.sleep_interval_s", DEFAULT_SLEEP_INTERVAL),
            "discovery_every_n": reader.get_int("orch_data.discovery_every_n", DEFAULT_DISCOVERY_EVERY_N),
            "cleanup_every_n": reader.get_int("orch_data.cleanup_every_n", DEFAULT_CLEANUP_EVERY_N),
            "discovery_days": reader.get_int("orch_data.discovery_days", DEFAULT_DISCOVERY_DAYS),
        }
    except Exception as e:
        logger.warning(f"Config fallback (DB error): {e}")
        return {
            "enabled": True,
            "sleep_interval_s": DEFAULT_SLEEP_INTERVAL,
            "discovery_every_n": DEFAULT_DISCOVERY_EVERY_N,
            "cleanup_every_n": DEFAULT_CLEANUP_EVERY_N,
            "discovery_days": DEFAULT_DISCOVERY_DAYS,
        }


async def run_forever():
    logger.info("BETIX Data Orchestrator Starting...")

    iteration = 0
    last_rankings_date = None

    # INITIAL RUN (Startup Task)
    logger.info("[STARTUP] Running Daily Cleanup & Stats (process_daily_matches)...")
    try:
        processor = DailyMatchOrchestrator()
        await processor.run()
    except Exception as e:
        logger.error(f"Startup Error in process_daily_matches: {e}")

    logger.info("Startup complete. Entering scheduled background cycles.")

    while True:
        try:
            cfg = load_data_config()

            if not cfg["enabled"]:
                logger.info("Orchestrator Data DISABLED by config. Waiting 60s...")
                await asyncio.sleep(60)
                continue

            logger.info(f"--- Start Data Cycle (Iter: {iteration}) ---")

            # MATCH DISCOVERY + ODDS INGESTION (configurable frequency)
            if iteration % cfg["discovery_every_n"] == 0:
                # Team roster refresh — MUST run before Match Discovery.
                # ingest_teams() re-fetches each league's CURRENT roster
                # from the API and upserts it, so it's the only thing that
                # ever picks up a promoted/newly added club. Nothing called
                # this automatically before — team ingestion was a one-time
                # manual bootstrap (IngestionOrchestrator.run_initial_import,
                # never wired into any scheduled job) — so any club added
                # to a league after that one manual run stayed permanently
                # invisible to analytics.teams. Any match involving such a
                # club then silently failed team-id resolution in
                # _transform_match() and was dropped during discovery,
                # with only a log line ("unresolved IDs") nobody sees.
                # Confirmed live: Arsenal vs Coventry (2026-08-21, Premier
                # League, in scope) was missing entirely because Coventry
                # was never in analytics.teams.
                logger.info("Running Team Roster Refresh...")
                for client_cls in (FootballClient, BasketballClient):
                    client = client_cls()
                    try:
                        count = await client.ingest_teams()
                        logger.info(f"[{client.sport}] Team roster refresh: {count} teams upserted.")
                    except Exception as e:
                        logger.error(f"Error refreshing teams for {client.sport}: {e}")
                    finally:
                        await client.close()

                logger.info("Running Match Discovery...")
                try:
                    discoverer = MatchDiscoverer(days=cfg["discovery_days"])
                    await discoverer.run()
                except Exception as e:
                    logger.error(f"Error in MatchDiscoverer: {e}")

                logger.info("Running Odds Ingestion...")
                try:
                    odds_ingester = OddsIngester()
                    await odds_ingester.run()
                except Exception as e:
                    logger.error(f"Error in OddsIngester: {e}")

            # DAILY MATCH ORCHESTRATOR (configurable frequency)
            if iteration % cfg["cleanup_every_n"] == 0 and iteration != 0:
                logger.info("Running Daily Cleanup & Stats...")
                try:
                    processor = DailyMatchOrchestrator()
                    await processor.run()
                except Exception as e:
                    logger.error(f"Error in DailyMatchOrchestrator: {e}")

            # TENNIS RANKINGS (weekly, on Mondays)
            today = datetime.now(timezone.utc)
            today_str = today.strftime("%Y-%m-%d")
            is_monday = today.weekday() == 0
            if is_monday and last_rankings_date != today_str:
                logger.info("Running Tennis Rankings Update (weekly)...")
                try:
                    rankings_updater = TennisRankingsUpdater(top=100)
                    await rankings_updater.run()
                    last_rankings_date = today_str
                    logger.info("Tennis Rankings Update complete.")
                except Exception as e:
                    logger.error(f"Error in TennisRankingsUpdater: {e}")

            iteration += 1
            if iteration > 14400: iteration = 0

            logger.info(f"--- Data Orchestrator Sleeping {cfg['sleep_interval_s']}s ---")
            await asyncio.sleep(cfg["sleep_interval_s"])

        except Exception as e:
            logger.error(f"Data Orchestrator Critical Error: {e}")
            await asyncio.sleep(60)

if __name__ == "__main__":
    try:
        asyncio.run(run_forever())
    except KeyboardInterrupt:
        logger.info("👋 Data Orchestrator stopped by user.")
