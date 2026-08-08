"""
BETIX — match_audit_script.py
Script chef d'orchestre pour l'audit complet d'un match :
1. Agrégation des données (DataAggregator)
2. Filtrage des statistiques essentielles
3. Génération de l'analyse (ConfidenceGenerator)
4. Archivage dans public.ai_match_audits
"""

import asyncio
import json
import logging
import argparse
from datetime import datetime, timezone
from typing import Dict, Any, Optional

from app.engine.data_aggregation import get_match_context
from app.engine.confidence_generator import generate_confidence, DEFAULT_MODEL
from app.services.ingestion.base_client import SupabaseREST
from app.config import get_settings

# Une seule ligne "courante" par match : les nouveaux passages de generation
# ecrivent sous ce run_id fixe et ecrasent la ligne existante (UPSERT), au lieu
# d'accumuler une nouvelle ligne datee a chaque passage comme l'ancien systeme.
# Les anciennes lignes historiques (run_id = 'YYYY-MM-DD_runN') restent intactes.
LIVE_RUN_ID = "live"

# Configuration du logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("betix.audit_script")

def filter_essential_stats(sport: str, context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Filtre le contexte pour ne garder que les statistiques 'maîtresses' 
    afin d'alléger l'archive JSON tout en gardant la substance de l'audit.
    """
    filtered = {
        "home": {},
        "away": {}
    }
    
    # Mapping des stats clés par sport
    keys_by_sport = {
        "basketball": ["l5_ortg", "l5_drtg", "l5_net_rtg", "l5_pace", "l5_efg_pct", "l10_ortg", "l10_drtg"],
        "football": ["l5_goals_for", "l5_goals_against", "l5_xg_for", "l5_xg_against", "l5_possession_avg", "l5_points"],
        "tennis": ["l10_aces_avg", "l10_first_serve_pct", "l10_first_serve_won", "l10_bp_saved_pct", "l10_return_won_pct", "l10_bp_converted_pct"]
    }
    
    keys = keys_by_sport.get(sport, [])
    
    # On récupère le "global" (all venues) du dernier snapshot rolling
    for side in ["home", "away"]:
        if sport == "tennis":
            side_key = "player1" if side == "home" else "player2"
            raw_form = context.get("rolling", {}).get(side_key, {}).get("overall", [])
        else:
            raw_form = context.get("form", {}).get(side, {}).get("global", [])
            
        if raw_form:
            latest = raw_form[0] # Le plus récent
            filtered[side] = {k: latest.get(k) for k in keys if k in latest}
            filtered[side]["date"] = latest.get("date")

    return filtered

async def run_audit(
    sport: str,
    match_id: int,
    provider: str = "claude",
    model_name: Optional[str] = None,
    run_id: str = LIVE_RUN_ID,
    db: Optional[SupabaseREST] = None,
):
    """Exécute le flux complet d'audit et archive le résultat.

    Ecrit un verrou 'pending' avant de lancer la génération IA, puis 'ready'
    (avec le résultat complet) ou 'failed' (avec le message d'erreur) — c'est
    ce statut que l'endpoint à la demande et le passage planifié utilisent pour
    éviter de lancer deux générations en parallèle sur le même match.

    Args:
        sport: "football", "basketball", ou "tennis"
        match_id: ID interne du match
        provider: Fournisseur IA
        model_name: Modele specifique (défaut: DEFAULT_MODEL, Haiku)
        run_id: 'live' par défaut — une seule ligne courante par match, écrasée
                à chaque nouvelle génération. Passer un run_id daté explicite
                pour archiver un snapshot historique séparé (rare, cas legacy).
        db: client Supabase à réutiliser (optionnel — sinon en crée un).
    """
    settings = get_settings()
    db = db or SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
    model_name = model_name or DEFAULT_MODEL

    logger.info(f"Demarrage de l'audit pour {sport} #{match_id} (run: {run_id})...")

    # 0. Verrou : marquer 'pending' AVANT l'appel IA (couteux et lent) pour
    #    qu'un second déclencheur concurrent (clic utilisateur + passage
    #    planifié, ou deux clics) voie l'état 'pending' et n'en démarre pas un second.
    db.upsert(
        "ai_match_audits",
        [{
            "match_id": match_id,
            "sport": sport,
            "run_id": run_id,
            "status": "pending",
            "attempted_at": datetime.now(timezone.utc).isoformat(),
        }],
        on_conflict="match_id,sport,run_id",
    )

    try:
        # 1. Agregation du contexte complet (Raw Dict pour archivage et filtrage)
        from app.engine.data_aggregation import get_match_raw_context
        context = await get_match_raw_context(sport, match_id)
        if not context or not context.get("match"):
            raise RuntimeError(f"Impossible de recuperer le contexte brut pour {sport} #{match_id}.")

        # 2. Filtrage des statistiques essentielles pour l'audit
        essential_stats = filter_essential_stats(sport, context)
        logger.info(f"Statistiques essentielles extraites pour {sport} (Home: {list(essential_stats['home'].keys())})")

        # 3. Generation de l'analyse IA (en passant le contexte deja agrege)
        analysis = await generate_confidence(
            sport=sport,
            match_id=match_id,
            provider=provider,
            model_name=model_name,
            context=context
        )

        if not analysis:
            raise RuntimeError("Echec de la generation de l'analyse IA.")

        # 4. Archivage dans public.ai_match_audits
        odds_ctx = context.get("odds", {}) or {}
        snapshots = [m.get("snapshot_at") for m in odds_ctx.values() if m.get("snapshot_at")]
        latest_snapshot = max(snapshots) if snapshots else None

        audit_data = {
            "match_id": match_id,
            "sport": sport,
            "run_id": run_id,
            "status": "ready",
            "error_message": None,
            "snapshot_at": latest_snapshot,
            "odds": context.get("odds"),
            "h2h": context.get("h2h"),
            "rolling_stats": essential_stats,
            "ai_analysis": analysis,
            "ai_provider": provider,
            "ai_model": model_name,
        }

        db.upsert("ai_match_audits", [audit_data], on_conflict="match_id,sport,run_id")
        logger.info(f"Audit archive avec succes (run: {run_id}).")
        return True

    except Exception as e:
        logger.error(f"Echec de l'audit pour {sport} #{match_id} : {e}")
        db.upsert(
            "ai_match_audits",
            [{
                "match_id": match_id,
                "sport": sport,
                "run_id": run_id,
                "status": "failed",
                "error_message": str(e)[:500],
            }],
            on_conflict="match_id,sport,run_id",
        )
        raise

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="BETIX -- Audit IA individuel")
    parser.add_argument("sport", choices=["football", "basketball", "tennis"])
    parser.add_argument("match_id", type=int)
    parser.add_argument("--provider", default="claude", choices=["gemini", "gpt", "claude"])
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--run-id", default=LIVE_RUN_ID, help="Identifiant du run (défaut: 'live' — écrase la ligne courante)")

    args = parser.parse_args()

    asyncio.run(run_audit(args.sport, args.match_id, args.provider, args.model, args.run_id))
