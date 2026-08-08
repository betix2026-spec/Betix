import os
import sys
import subprocess
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s — %(message)s")
logger = logging.getLogger("draft.fb_pipeline")

def run_fb_pipeline(targets: list):
    """
    Runs the update pipeline (Stats -> H2H -> Rolling) for Football/Basketball.
    targets: list of dict {"api_id": int, "sport": str}
    """
    if not targets:
        logger.info("⚽🏀 [PIPELINE FB] No matches to process.")
        return

    logger.info(f"🚀 [PIPELINE FB] Starting for {len(targets)} match(es)")

    # Path to the update scripts directory
    scripts_dir = os.path.dirname(__file__)

    for item in targets:
        api_id = item["api_id"]
        sport = item["sport"]
        logger.info(f"\n   ⚙️ Starting pipeline for {sport.upper()} {api_id}")

        # 1. Stats (takes --sport and --match-id)
        logger.info(f"      -> Running: update_match_stats.py")
        cmd_stats = [sys.executable, os.path.join(scripts_dir, "update_match_stats.py"), "--sport", sport, "--match-id", str(api_id)]

        # 2. H2H (takes --match-id and --sport)
        logger.info(f"      -> Running: update_match_h2h.py")
        cmd_h2h = [sys.executable, os.path.join(scripts_dir, "update_match_h2h.py"), "--sport", sport, "--match-id", str(api_id)]

        # 3. Rolling (takes --match-id and --sport)
        logger.info(f"      -> Running: update_match_rolling.py")
        cmd_rolling = [sys.executable, os.path.join(scripts_dir, "update_match_rolling.py"), "--sport", sport, "--match-id", str(api_id)]

        # 4. ELO (takes --match-id and --sport)
        logger.info(f"      -> Running: update_match_elo.py")
        cmd_elo = [sys.executable, os.path.join(scripts_dir, "update_match_elo.py"), "--sport", sport, "--match-id", str(api_id)]

        commands = [
            ("STATS", cmd_stats),
            ("H2H", cmd_h2h),
            ("ROLLING", cmd_rolling),
            ("ELO", cmd_elo),
        ]

        for name, cmd in commands:
            try:
                logger.info(f"         Running {name}...")
                result = subprocess.run(cmd, capture_output=True, text=True, check=False)
                if result.returncode != 0:
                    logger.error(f"         ❌ Error {name}: {result.stderr}")
                else:
                    logger.info(f"         ✅ Success {name}")
            except Exception as e:
                logger.error(f"         ❌ Exception {name}: {e}")

    logger.info("✅ [PIPELINE FB] Done.")

if __name__ == "__main__":
    # Manual test if needed
    # run_fb_pipeline([{"api_id": 12345, "sport": "football"}])
    pass
