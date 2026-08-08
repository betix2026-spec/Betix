"""
BETIX -- orchestrator.py
The "Brain" that manages time-based automation.
Runs the different radars at their respective frequencies.

Default frequencies (configurable via system_config):
- monitor_live: 2 min
- mark_live: 4 min
- mark_imminent: 16 min
"""

import asyncio
import logging
import sys
import os
# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

# Import logic from scripts
from scripts.updates.mark_imminent import ImminentRadar
from scripts.updates.mark_live import LiveSwitchRadar
from scripts.updates.monitor_live import LiveMatchMonitor
from app.services.config_reader import ConfigReader

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s -- %(message)s",
    force=True,
    handlers=[
        logging.FileHandler("automation.log", encoding='utf-8'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("betix.orchestrator")

# Defaults (fallback if the DB is unreachable)
DEFAULT_MONITOR_INTERVAL = 120
DEFAULT_MARK_LIVE_EVERY_N = 2
DEFAULT_MARK_IMMINENT_EVERY_N = 8


def load_live_config() -> dict:
    """Loads the live config from system_config."""
    try:
        reader = ConfigReader()
        return {
            "enabled": reader.get_bool("orch_live.enabled", True),
            "monitor_interval_s": reader.get_int("orch_live.monitor_interval_s", DEFAULT_MONITOR_INTERVAL),
            "mark_live_every_n": reader.get_int("orch_live.mark_live_every_n", DEFAULT_MARK_LIVE_EVERY_N),
            "mark_imminent_every_n": reader.get_int("orch_live.mark_imminent_every_n", DEFAULT_MARK_IMMINENT_EVERY_N),
        }
    except Exception as e:
        logger.warning(f"Config fallback (DB error): {e}")
        return {
            "enabled": True,
            "monitor_interval_s": DEFAULT_MONITOR_INTERVAL,
            "mark_live_every_n": DEFAULT_MARK_LIVE_EVERY_N,
            "mark_imminent_every_n": DEFAULT_MARK_IMMINENT_EVERY_N,
        }


async def run_forever():
    logger.info("BETIX Orchestrator Starting...")

    iteration = 0

    while True:
        try:
            cfg = load_live_config()

            if not cfg["enabled"]:
                logger.info("Orchestrator Live DISABLED by config. Waiting 60s...")
                await asyncio.sleep(60)
                continue

            logger.info(f"--- Start Cycle (Iter: {iteration}) ---")

            # MONITOR LIVE : Updates scores and closes finished matches
            monitor = LiveMatchMonitor()
            await monitor.run()

            # MARK LIVE (configurable frequency)
            if iteration % cfg["mark_live_every_n"] == 0:
                radar_live = LiveSwitchRadar()
                await radar_live.run()

            # MARK IMMINENT (configurable frequency)
            if iteration % cfg["mark_imminent_every_n"] == 0:
                radar_imminent = ImminentRadar()
                await radar_imminent.run()

            iteration += 1
            if iteration > 10000: iteration = 0

            logger.info(f"--- Sleeping {cfg['monitor_interval_s']}s ---")
            await asyncio.sleep(cfg["monitor_interval_s"])

        except Exception as e:
            logger.error(f"Orchestrator Critical Error: {e}")
            await asyncio.sleep(60)

if __name__ == "__main__":
    try:
        asyncio.run(run_forever())
    except KeyboardInterrupt:
        logger.info("Orchestrator stopped by user.")
