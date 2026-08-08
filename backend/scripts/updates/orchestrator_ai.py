"""
!! RETIRE (2026-08-01) !! Ne plus lancer ce script.
Remplace par scripts/updates/scheduled_audit_pass.py, qui tourne desormais a
l'interieur du process API via APScheduler (voir app/main.py). Ce fichier
re-analysait chaque match jusqu'a 4x/jour sur une fenetre glissante de 3 jours
sans jamais verifier si un match avait deja ete audite la veille -- c'est ce
qui causait les couts IA excessifs diagnostiques. Conserve ici pour
l'historique/reference uniquement ; plus reference nulle part dans le code.

BETIX -- orchestrator_ai.py
Orchestrateur dedie aux analyses IA (independant de l'orchestrateur live).

Gere le scheduling des runs d'audit avec frequences configurables par sport.
Toute la configuration est lue depuis system_config (pilotable via le panel admin).

Defaults (si la base est injoignable) :
  Football   : 2 runs/jour
  Basketball : 3 runs/jour
  Tennis     : 4 runs/jour

Planning par defaut (heures UTC) :
  Run 1 : 08:00  |  Run 2 : 14:00  |  Run 3 : 18:00  |  Run 4 : 22:00

Usage :
    python -m scripts.updates.orchestrator_ai
    python -m scripts.updates.orchestrator_ai --once
    python -m scripts.updates.orchestrator_ai --force-run 2
"""

import asyncio
import argparse
import logging
import sys
import os
from datetime import datetime, timezone

# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from scripts.updates.batch_audit_next_days import run_batch
from app.services.config_reader import ConfigReader

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s -- %(message)s",
    force=True,
    handlers=[
        logging.FileHandler("ai_orchestrator.log", encoding='utf-8'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("betix.orchestrator_ai")

# =====================================================================
# DEFAULT VALUES (fallback si la base est injoignable)
# =====================================================================

DEFAULT_SCHEDULE_UTC = {1: 8, 2: 14, 3: 18, 4: 22}
DEFAULT_TOLERANCE_MINUTES = 10
DEFAULT_CHECK_INTERVAL = 300
DEFAULT_SCAN_DAYS = 3
DEFAULT_AUDIT_PAUSE = 3

DEFAULT_SPORT_CONFIG = {
    "football":   {"runs_per_day": 2, "provider": "claude", "model": "claude-sonnet-4-6"},
    "basketball": {"runs_per_day": 3, "provider": "claude", "model": "claude-sonnet-4-6"},
    "tennis":     {"runs_per_day": 4, "provider": "claude", "model": "claude-sonnet-4-6"},
}


def load_ai_config() -> dict:
    """Charge la config AI depuis system_config."""
    try:
        reader = ConfigReader()
        return {
            "enabled": reader.get_bool("orch_ai.enabled", True),
            "check_interval_s": reader.get_int("orch_ai.check_interval_s", DEFAULT_CHECK_INTERVAL),
            "tolerance_min": reader.get_int("orch_ai.tolerance_min", DEFAULT_TOLERANCE_MINUTES),
            "scan_days": reader.get_int("orch_ai.scan_days", DEFAULT_SCAN_DAYS),
            "audit_pause_s": reader.get_int("orch_ai.audit_pause_s", DEFAULT_AUDIT_PAUSE),
            "schedule": reader.get_ai_schedule(),
            "sport_config": reader.get_sport_config(),
        }
    except Exception as e:
        logger.warning(f"Config fallback (erreur DB) : {e}")
        return {
            "enabled": True,
            "check_interval_s": DEFAULT_CHECK_INTERVAL,
            "tolerance_min": DEFAULT_TOLERANCE_MINUTES,
            "scan_days": DEFAULT_SCAN_DAYS,
            "audit_pause_s": DEFAULT_AUDIT_PAUSE,
            "schedule": DEFAULT_SCHEDULE_UTC,
            "sport_config": DEFAULT_SPORT_CONFIG,
        }


class AuditScheduler:
    """Gere le declenchement des runs d'audit IA selon l'horloge."""

    def __init__(self):
        self._completed_runs: dict[str, set[int]] = {}

    def _today_key(self) -> str:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")

    def _reset_if_new_day(self):
        today = self._today_key()
        if today not in self._completed_runs:
            self._completed_runs.clear()
            self._completed_runs[today] = set()

    def get_pending_run(self, sport_config: dict, schedule: dict, tolerance_min: int) -> int | None:
        """Retourne le numero du run a lancer maintenant, ou None."""
        self._reset_if_new_day()

        if not sport_config:
            return None

        now = datetime.now(timezone.utc)
        today = self._today_key()
        completed = self._completed_runs.get(today, set())

        max_runs = max(cfg["runs_per_day"] for cfg in sport_config.values())

        for run_num in range(1, max_runs + 1):
            if run_num in completed:
                continue

            scheduled_hour = schedule.get(run_num)
            if scheduled_hour is None:
                continue

            diff_minutes = (now.hour * 60 + now.minute) - (scheduled_hour * 60)
            if 0 <= diff_minutes <= tolerance_min:
                return run_num

        return None

    def mark_completed(self, run_number: int):
        today = self._today_key()
        self._reset_if_new_day()
        self._completed_runs[today].add(run_number)

    def get_status(self, sport_config: dict, schedule: dict) -> dict:
        today = self._today_key()
        completed = self._completed_runs.get(today, set())
        max_runs = max(cfg["runs_per_day"] for cfg in sport_config.values()) if sport_config else 0

        sport_schedule = {}
        for sport, cfg in sport_config.items():
            runs = cfg["runs_per_day"]
            sport_schedule[sport] = {
                "runs_per_day": runs,
                "slots": [f"run{i} @ {schedule.get(i, '?')}:00 UTC" for i in range(1, runs + 1)],
            }

        return {
            "date": today,
            "completed_runs": sorted(completed),
            "total_slots": max_runs,
            "sports": sport_schedule,
        }


async def execute_run(run_number: int, cfg: dict):
    """Execute un run et retourne le resultat."""
    sport_config = cfg["sport_config"]

    logger.info(f"{'=' * 60}")
    logger.info(f"AUDIT IA : Lancement du Run #{run_number}")

    active = [s for s, sc in sport_config.items() if run_number <= sc["runs_per_day"]]
    logger.info(f"Sports actifs : {active}")
    logger.info(f"{'=' * 60}")

    result = await run_batch(
        run_number=run_number,
        days=cfg["scan_days"],
        interval=cfg["audit_pause_s"],
        sport_config_override=sport_config,
    )

    logger.info(
        f"Run #{run_number} termine : "
        f"{result['audited']} audites, {result['skipped']} skipped, "
        f"{result['errors']} erreurs"
    )

    if result.get("circuit_breaker"):
        logger.warning("Circuit breaker active durant ce run.")

    return result


async def run_forever():
    """Boucle principale : verifie periodiquement si un run doit se lancer."""
    logger.info("BETIX AI Orchestrator Starting...")

    scheduler = AuditScheduler()

    # Log initial config
    cfg = load_ai_config()
    status = scheduler.get_status(cfg["sport_config"], cfg["schedule"])
    logger.info(f"Schedule: {status}")

    while True:
        try:
            cfg = load_ai_config()

            if not cfg["enabled"]:
                logger.info("Orchestrator AI DESACTIVE par la config. Attente 60s...")
                await asyncio.sleep(60)
                continue

            pending_run = scheduler.get_pending_run(
                cfg["sport_config"], cfg["schedule"], cfg["tolerance_min"]
            )

            if pending_run is not None:
                try:
                    await execute_run(pending_run, cfg)
                    scheduler.mark_completed(pending_run)
                except Exception as e:
                    logger.error(f"Erreur lors du run #{pending_run} : {e}")
                    scheduler.mark_completed(pending_run)

                status = scheduler.get_status(cfg["sport_config"], cfg["schedule"])
                logger.info(f"Status apres run: {status}")
            else:
                now = datetime.now(timezone.utc)
                logger.debug(f"Rien a lancer ({now.strftime('%H:%M')} UTC). Prochain check dans {cfg['check_interval_s']}s.")

            await asyncio.sleep(cfg["check_interval_s"])

        except Exception as e:
            logger.error(f"AI Orchestrator Error: {e}")
            await asyncio.sleep(60)


async def run_once(force_run: int | None = None):
    """Mode one-shot : lance un run specifique ou le prochain pending."""
    cfg = load_ai_config()
    scheduler = AuditScheduler()

    run_number = force_run or scheduler.get_pending_run(
        cfg["sport_config"], cfg["schedule"], cfg["tolerance_min"]
    )

    if run_number is None:
        logger.info("Aucun run pending pour le moment.")
        status = scheduler.get_status(cfg["sport_config"], cfg["schedule"])
        logger.info(f"Status: {status}")
        return

    try:
        await execute_run(run_number, cfg)
    except Exception as e:
        logger.error(f"Erreur lors du run #{run_number} : {e}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="BETIX -- AI Orchestrator")
    parser.add_argument("--once", action="store_true", help="Un seul cycle puis exit")
    parser.add_argument("--force-run", type=int, default=None, help="Force un run specifique (1-4)")

    args = parser.parse_args()

    try:
        if args.once or args.force_run:
            asyncio.run(run_once(args.force_run))
        else:
            asyncio.run(run_forever())
    except KeyboardInterrupt:
        logger.info("AI Orchestrator stopped by user.")
