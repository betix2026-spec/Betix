"""
!! RETIRE (2026-08-01) !! Ne plus lancer ce script.
Remplace par scripts/updates/scheduled_audit_pass.py (une seule generation
par match top-tier, ~24h avant coup d'envoi) + routers/audits.py (generation
a la demande). Le dedoublonnage par run_id date ci-dessous ne detectait que
les doublons DANS LA MEME JOURNEE -- un match restant dans la fenetre de 3
jours etait donc re-audite en entier chaque jour, jusqu'a 16x pour un meme
match. Conserve ici pour l'historique/reference uniquement.

BETIX -- batch_audit_next_days.py
Batch d'audit IA avec frequences configurables par sport.

Frequences par defaut :
  - Football   : 2 runs/jour
  - Basketball  : 3 runs/jour
  - Tennis      : 4 runs/jour

Chaque run genere un `run_id` unique (ex: "2026-03-05_run2") et ne relance
PAS un audit si ce run_id existe deja pour le match en base.

Usage CLI:
    python -m scripts.updates.batch_audit_next_days --run-number 1
    python -m scripts.updates.batch_audit_next_days --run-number 2 --dry-run
    python -m scripts.updates.batch_audit_next_days --run-number 1 --sports football,tennis
"""

import asyncio
import logging
import argparse
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Optional

from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST
from scripts.updates.match_audit_script import run_audit

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("betix.batch_audit")

# =====================================================================
# CONFIGURATION DES FREQUENCES PAR SPORT (configurable)
# =====================================================================

SPORT_CONFIG = {
    "football": {
        "runs_per_day": 2,
        "provider": "claude",
        "model": "claude-sonnet-4-6",
    },
    "basketball": {
        "runs_per_day": 3,
        "provider": "claude",
        "model": "claude-sonnet-4-6",
    },
    "tennis": {
        "runs_per_day": 4,
        "provider": "claude",
        "model": "claude-sonnet-4-6",
    },
}

# Mots-cles indiquant une saturation de quota ou rate-limit IA
CIRCUIT_BREAKER_KEYWORDS = ["rate_limit", "quota", "overloaded", "429", "insufficient_quota"]


def is_circuit_breaker_triggered(error_msg: str) -> bool:
    msg = error_msg.lower()
    return any(kw in msg for kw in CIRCUIT_BREAKER_KEYWORDS)


def make_run_id(run_number: int, date: Optional[datetime] = None) -> str:
    """Genere un run_id deterministe : '2026-03-05_run1'."""
    d = date or datetime.now(timezone.utc)
    return f"{d.strftime('%Y-%m-%d')}_run{run_number}"


def sport_should_run(sport: str, run_number: int) -> bool:
    """Verifie si ce sport doit etre audite pour ce numero de run.

    Ex: football (2 runs/jour) doit tourner sur run 1 et 2 seulement.
        tennis (4 runs/jour) tourne sur run 1, 2, 3, 4.
    """
    max_runs = SPORT_CONFIG.get(sport, {}).get("runs_per_day", 1)
    return run_number <= max_runs


async def find_eligible_matches(db: SupabaseREST, sport: str, days: int = 3) -> List[int]:
    """Trouve les IDs de matchs prevus dans les X jours ayant des cotes."""
    now = datetime.now(timezone.utc)
    limit_date = now + timedelta(days=days)

    now_str = now.isoformat()
    limit_str = limit_date.isoformat()

    table = f"{sport}_matches"
    logger.info(f"Recherche des matchs {sport.upper()} entre {now_str[:10]} et {limit_str[:10]}...")

    try:
        matches = db.select(
            table,
            "id,date_time",
            filters={"date_time": ("gte", now_str)}
        )
        eligible_matches = [m for m in matches if m["date_time"] <= limit_str]
        eligible_ids = [m["id"] for m in eligible_matches]
    except Exception as e:
        logger.error(f"Erreur lors de la lecture des matchs {sport} : {e}")
        return []

    if not eligible_ids:
        logger.info(f"   Aucun match trouve pour {sport} dans cette fenetre.")
        return []

    # Filtrer ceux qui ont des cotes
    # PostgREST limite a 1000 lignes par defaut et odds_snapshots a ~150 lignes/match.
    # On verifie par petits lots de 5 matchs pour rester sous la limite.
    final_ids = []
    CHUNK = 5
    for i in range(0, len(eligible_ids), CHUNK):
        chunk = eligible_ids[i:i + CHUNK]
        ids_str = ",".join(map(str, chunk))
        try:
            odds_rows = db.select_raw(
                "odds_snapshots",
                f"sport=eq.{sport}&match_id=in.({ids_str})&select=match_id&limit=1000"
            )
            found = set(row["match_id"] for row in odds_rows)
            final_ids.extend(found)
        except Exception as e:
            logger.error(f"Erreur lors du filtrage par cotes (chunk {i}): {e}")
    return list(set(final_ids))


async def find_already_audited(db_public: SupabaseREST, sport: str, match_ids: List[int], run_id: str) -> set:
    """Retourne les match_ids deja audites pour ce run_id."""
    if not match_ids:
        return set()

    ids_str = ",".join(map(str, match_ids))
    try:
        rows = db_public.select_raw(
            "ai_match_audits",
            f"sport=eq.{sport}&run_id=eq.{run_id}&match_id=in.({ids_str})&select=match_id"
        )
        return set(row["match_id"] for row in rows)
    except Exception as e:
        logger.warning(f"Impossible de verifier les audits existants : {e}")
        return set()


async def run_batch(
    run_number: int,
    days: int = 3,
    interval: int = 3,
    dry_run: bool = False,
    sports_filter: Optional[List[str]] = None,
    provider_override: Optional[str] = None,
    model_override: Optional[str] = None,
    sport_config_override: Optional[Dict[str, Any]] = None,
):
    """Lance le batch d'audit IA pour un numero de run donne.

    Args:
        run_number: Numero du run dans la journee (1, 2, 3, 4).
        days: Fenetre de scan en jours.
        interval: Pause entre audits (secondes).
        dry_run: Mode simulation.
        sports_filter: Liste de sports a traiter (None = tous).
        provider_override: Force un provider pour tous les sports.
        model_override: Force un modele pour tous les sports.
        sport_config_override: Config par sport depuis l'orchestrateur (prioritaire sur SPORT_CONFIG).
    """
    active_config = sport_config_override or SPORT_CONFIG

    settings = get_settings()
    db_analytics = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="analytics")
    db_public = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="public")

    run_id = make_run_id(run_number)
    all_sports = sports_filter or list(active_config.keys())

    total_audited = 0
    total_skipped = 0
    total_errors = 0

    logger.info("=" * 60)
    logger.info(f"BETIX Batch Audit -- Run #{run_number} ({run_id})")
    logger.info(f"Sports actifs pour ce run : {[s for s in all_sports if run_number <= active_config.get(s, {}).get('runs_per_day', 1)]}")
    if dry_run:
        logger.info("MODE DRY-RUN ACTIF")
    logger.info("=" * 60)

    for sport in all_sports:
        # Verifier si ce sport doit tourner sur ce run
        sport_cfg = active_config.get(sport, {})
        max_runs = sport_cfg.get("runs_per_day", 1)
        if run_number > max_runs:
            logger.info(f"[SKIP] {sport.upper()} : max {max_runs} runs/jour, run #{run_number} non concerne.")
            continue

        config = sport_cfg
        provider = provider_override or config["provider"]
        model = model_override or config["model"]

        # Trouver les matchs eligibles
        match_ids = await find_eligible_matches(db_analytics, sport, days)
        if not match_ids:
            continue

        # Filtrer ceux deja audites pour ce run_id
        already_done = await find_already_audited(db_public, sport, match_ids, run_id)
        pending_ids = [mid for mid in match_ids if mid not in already_done]

        logger.info(
            f"{sport.upper()} : {len(match_ids)} matchs eligibles, "
            f"{len(already_done)} deja audites, {len(pending_ids)} a traiter"
        )

        if dry_run:
            for mid in pending_ids:
                logger.info(f"   [DRY-RUN] Pret a auditer {sport} #{mid} (run: {run_id}, provider: {provider})")
            total_skipped += len(already_done)
            continue

        for mid in pending_ids:
            try:
                success = await run_audit(
                    sport, mid,
                    provider=provider,
                    model_name=model,
                    run_id=run_id,
                )

                if success:
                    total_audited += 1
                    logger.info(f"   Audit reussi pour {sport} #{mid}")
                else:
                    total_errors += 1

                await asyncio.sleep(interval)

            except Exception as e:
                error_msg = str(e)
                logger.error(f"Echec sur {sport} #{mid} : {error_msg}")

                if is_circuit_breaker_triggered(error_msg):
                    logger.warning("CIRCUIT BREAKER ACTIVE : Limite de quota IA atteinte.")
                    logger.info(f"Arret propre apres {total_audited} audits.")
                    return {
                        "audited": total_audited,
                        "skipped": total_skipped + len(already_done),
                        "errors": total_errors,
                        "circuit_breaker": True,
                    }

                total_errors += 1

        total_skipped += len(already_done)

    logger.info("=" * 60)
    logger.info(f"Batch termine ! Succes: {total_audited}, Skipped: {total_skipped}, Echecs: {total_errors}")
    logger.info("=" * 60)

    return {
        "audited": total_audited,
        "skipped": total_skipped,
        "errors": total_errors,
        "circuit_breaker": False,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="BETIX -- Batch Audit IA (multi-frequence)")
    parser.add_argument("--run-number", type=int, required=True, help="Numero du run dans la journee (1, 2, 3, 4)")
    parser.add_argument("--days", type=int, default=3, help="Fenetre de scan en jours (defaut: 3)")
    parser.add_argument("--interval", type=int, default=3, help="Pause entre audits en secondes (defaut: 3)")
    parser.add_argument("--dry-run", action="store_true", help="Mode simulation")
    parser.add_argument("--sports", default=None, help="Filtrer les sports (ex: football,tennis)")
    parser.add_argument("--provider", default=None, choices=["gemini", "gpt", "claude"], help="Forcer un provider")
    parser.add_argument("--model", default=None, help="Forcer un modele")

    args = parser.parse_args()
    sports = args.sports.split(",") if args.sports else None

    asyncio.run(run_batch(
        run_number=args.run_number,
        days=args.days,
        interval=args.interval,
        dry_run=args.dry_run,
        sports_filter=sports,
        provider_override=args.provider,
        model_override=args.model,
    ))
