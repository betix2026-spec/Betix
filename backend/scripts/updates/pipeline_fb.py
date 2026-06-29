import os
import sys
import subprocess
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s — %(message)s")
logger = logging.getLogger("draft.fb_pipeline")

def run_fb_pipeline(targets: list):
    """
    Exécute la pipeline (Stats -> H2H -> Rolling) pour Foot/Basket.
    targets: list of dict {"api_id": int, "sport": str}
    """
    if not targets:
        logger.info("⚽🏀 [PIPELINE FB] Aucun match à traiter.")
        return

    logger.info(f"🚀 [PIPELINE FB] Démarrage pour {len(targets)} match(s)")
    
    # Chemin vers le dossier des scripts d'update
    scripts_dir = os.path.dirname(__file__)
    
    for item in targets:
        api_id = item["api_id"]
        sport = item["sport"]
        logger.info(f"\n   ⚙️ Début de la pipeline pour {sport.upper()} {api_id}")
        
        # 1. Stats (Prend --sport et --match-id)
        logger.info(f"      -> Exécution de : update_match_stats.py")
        cmd_stats = [sys.executable, os.path.join(scripts_dir, "update_match_stats.py"), "--sport", sport, "--match-id", str(api_id)]
        
        # 2. H2H (Prend --match-id et --sport)
        logger.info(f"      -> Exécution de : update_match_h2h.py")
        cmd_h2h = [sys.executable, os.path.join(scripts_dir, "update_match_h2h.py"), "--sport", sport, "--match-id", str(api_id)]
        
        # 3. Rolling (Prend --match-id et --sport)
        logger.info(f"      -> Exécution de : update_match_rolling.py")
        cmd_rolling = [sys.executable, os.path.join(scripts_dir, "update_match_rolling.py"), "--sport", sport, "--match-id", str(api_id)]

        # 4. ELO (Prend --match-id et --sport)
        logger.info(f"      -> Exécution de : update_match_elo.py")
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
                    logger.error(f"         ❌ Erreur {name} : {result.stderr}")
                else:
                    logger.info(f"         ✅ Succès {name}")
            except Exception as e:
                logger.error(f"         ❌ Exception {name} : {e}")

    logger.info("✅ [PIPELINE FB] Terminé.")

if __name__ == "__main__":
    # Test manuel si besoin
    # run_fb_pipeline([{"api_id": 12345, "sport": "football"}])
    pass
