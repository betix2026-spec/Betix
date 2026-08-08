import os
import sys
import subprocess
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s — %(message)s")
logger = logging.getLogger("draft.tennis_pipeline")

def run_tennis_pipeline(api_ids: list):
    """
    Runs the update pipeline (Stats -> H2H -> Rolling) for each finished match.
    """
    if not api_ids:
        logger.info("🎾 [PIPELINE TENNIS] No matches to process in the pipeline.")
        return

    logger.info(f"🚀 [PIPELINE TENNIS] Starting pipeline for {len(api_ids)} match(es): {api_ids}")

    # Path to the update scripts directory
    scripts_dir = os.path.dirname(__file__)

    scripts_to_run = [
        "update_tennis_stats.py",
        "update_tennis_h2h.py",
        "update_tennis_rolling.py"
    ]

    for api_id in api_ids:
        logger.info(f"\n   ⚙️ Starting pipeline for match {api_id}")

        for script_name in scripts_to_run:
            script_path = os.path.join(scripts_dir, script_name)

            # Execution log
            logger.info(f"      -> Running: {script_name} for {api_id}")

            # Actual script call via sys.executable
            cmd = [sys.executable, script_path, "--match-id", str(api_id)]
            try:
                result = subprocess.run(cmd, capture_output=True, text=True, check=False)
                if result.returncode != 0:
                    logger.error(f"      ❌ Error in {script_name} for {api_id}: {result.stderr}")
                else:
                    logger.info(f"      ✅ Success: {script_name}")
            except Exception as e:
                logger.error(f"      ❌ Exception while running {script_name}: {e}")

        logger.info(f"   🏁 Pipeline done for match {api_id}\n")

    logger.info("✅ [PIPELINE TENNIS] Process fully complete.")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-ids", type=int, nargs="+", help="List of IDs to process")
    args = parser.parse_args()
    if args.api_ids:
        run_tennis_pipeline(args.api_ids)
    else:
        run_tennis_pipeline([12104504])
