"""
BETIX — confidence_generator.py
Génère les analyses de confiance IA pour les matchs sportifs.

Flux : Agrégateur → Prompt Builder → ChatModel (Gemini/GPT/Claude) → JSON structuré

Usage CLI:
    python -m app.engine.confidence_generator football 2629
    python -m app.engine.confidence_generator tennis 3028 --provider gemini
    python -m app.engine.confidence_generator basketball 2141 --provider gpt
"""

import json
import re
import logging
import asyncio
from typing import Dict, Any, Optional

from app.engine.ai_model import ChatModel
from app.engine.prompt_builder import build_audit_prompt
from app.config import get_settings

logger = logging.getLogger("betix.confidence_generator")

# ═══════════════════════════════════════════════════════════════════
# CONFIGURATION IA
# ═══════════════════════════════════════════════════════════════════

# Config optimisée pour l'analyse de paris (JSON structuré, pas créatif)
# max_tokens relevé (8192 -> 11000) car l'analyse et sa traduction 4-langues
# sont désormais produites en UN SEUL appel au lieu de deux.
AI_CONFIG = {
    "temperature": 0.4,       # Légèrement plus exploratoire pour éviter le biais de confirmation
    "max_tokens": 11000,      # JSON riche + 4 langues = besoin d'espace
    "top_p": 0.85,
    "top_k": 40,              # Plus de diversité dans les raisonnements explorés
}

DEFAULT_MODEL = "claude-haiku-4-5-20251001"


# ═══════════════════════════════════════════════════════════════════
# PARSING DE LA RÉPONSE IA
# ═══════════════════════════════════════════════════════════════════

def parse_ai_response(raw: str) -> Optional[Dict[str, Any]]:
    """
    Parse la réponse brute de l'IA pour extraire le JSON structuré.
    Gère les cas où l'IA entoure le JSON de markdown (```json ... ```).
    """
    if not raw:
        return None

    # Tentative 1 : JSON direct
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # Tentative 2 : Extraction du bloc ```json ... ```
    match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass

    # Tentative 3 : Trouver le premier { ... } dans le texte
    match = re.search(r'\{.*\}', raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    logger.error("❌ Impossible de parser la réponse IA. Exportation du raw complet vers debug_ai_raw.log")
    try:
        with open("debug_ai_raw.log", "w", encoding="utf-8") as f:
            f.write(raw)
    except Exception as e:
        logger.error(f"Failed to write debug log: {e}")
        
    return None


LANGS = ("fr", "en", "es", "de")


def normalize_language_fields(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Le modèle produit désormais `match_summary`/`market`/`selection`/`analysis`
    directement en 4 langues en un seul appel (voir prompt_builder.OUTPUT_FORMAT) —
    il n'y a plus d'appel de traduction séparé. Cette fonction ne fait que
    combler une langue manquante par le français si le modèle en a oublié une,
    pour qu'aucun champ ne soit jamais vide côté frontend.
    """
    def fill(obj):
        if not isinstance(obj, dict):
            return {lang: (obj or "") for lang in LANGS}
        fr = obj.get("fr") or ""
        return {lang: (obj.get(lang) or fr) for lang in LANGS}

    if "match_summary" in data:
        data["match_summary"] = fill(data["match_summary"])

    for cat in ("high_confidence", "medium_confidence", "risky"):
        for item in data.get("categories", {}).get(cat, []):
            for field in ("market", "selection", "analysis"):
                if field in item:
                    item[field] = fill(item[field])

    return data


VALID_OUTCOME_TYPES = {
    "moneyline", "double_chance", "over_under", "handicap",
    "btts", "correct_score", "sets_total", "other",
}


def normalize_outcome_fields(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Garantit que chaque sélection porte un champ `outcome` structuré et valide,
    même si le modèle l'a omis ou a inventé un `type` hors taxonomie — pour que
    la vérification automatique (Phase 3) n'ait jamais à null-checker ce champ.
    """
    categories = data.get("categories", {})
    for cat in ("high_confidence", "medium_confidence", "risky"):
        for item in categories.get(cat, []):
            outcome = item.get("outcome")
            if not isinstance(outcome, dict) or outcome.get("type") not in VALID_OUTCOME_TYPES:
                item["outcome"] = {"type": "other", "side": None, "line": None}
    return data


def validate_analysis(data: Dict[str, Any]) -> bool:
    """Vérifie que le JSON de l'IA contient les champs obligatoires."""
    required = ["match_summary", "data_quality", "categories"]
    missing = [k for k in required if k not in data]
    if missing:
        logger.warning(f"Champs manquants dans l'analyse : {missing}")
        return False

    categories = data.get("categories", {})
    cat_keys = ["high_confidence", "medium_confidence", "risky"]
    missing_cats = [k for k in cat_keys if k not in categories]
    if missing_cats:
        logger.warning(f"Catégories manquantes : {missing_cats}")
        return False

    for cat in cat_keys:
        items = categories.get(cat, [])
        if not isinstance(items, list) or len(items) > 3:
            logger.warning(f"Catégorie '{cat}' invalide (taille: {len(items) if isinstance(items, list) else 'non-list'}, max: 3).")
            return False

    # At least 1 bet total across all categories
    total_bets = sum(len(categories.get(c, [])) for c in cat_keys)
    if total_bets < 1:
        logger.warning("Aucun pari proposé dans l'analyse.")
        return False

    # Validate confidence scores are within expected ranges per category
    score_ranges = {"high_confidence": (80, 99), "medium_confidence": (60, 79), "risky": (30, 59)}
    for cat in cat_keys:
        for item in categories.get(cat, []):
            score = item.get("confidence_score")
            if score is not None:
                lo, hi = score_ranges[cat]
                if not (lo <= score <= hi):
                    market_label = (item.get("market") or {}).get("fr", item.get("market"))
                    logger.warning(f"Score {score} hors range [{lo}-{hi}] pour catégorie '{cat}' (market: {market_label}).")

    return True


# ═══════════════════════════════════════════════════════════════════
# GÉNÉRATEUR DE CONFIANCE
# ═══════════════════════════════════════════════════════════════════

async def generate_confidence(
    sport: str,
    match_id: int,
    provider: str = "claude",
    model_name: Optional[str] = DEFAULT_MODEL,
    context: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """
    Génère une analyse de confiance IA pour un match donné.

    Args:
        sport: "football", "basketball", ou "tennis"
        match_id: ID interne du match
        provider: Fournisseur IA ("gemini", "gpt", "claude")
        model_name: Modèle spécifique (optionnel)

    Returns:
        Dict JSON structuré avec l'analyse ou None en cas d'erreur.
    """
    # 1. Construire les prompts via le prompt_builder
    logger.info(f"🎯 Génération de confiance pour {sport} #{match_id} (provider={provider})")

    try:
        system_prompt, user_prompt, context = await build_audit_prompt(sport, match_id, context=context)
    except (ValueError, RuntimeError) as e:
        logger.error(f"❌ Erreur prompt_builder: {e}")
        return None

    # 2. Initialiser le modèle IA
    settings = get_settings()

    # Récupérer la clé API selon le provider
    api_key = None
    if provider == "gemini":
        api_key = getattr(settings, "GEMINI_API_KEY", None)
    elif provider in ("gpt", "openai"):
        api_key = getattr(settings, "OPENAI_API_KEY", None)
    elif provider in ("claude", "anthropic"):
        api_key = getattr(settings, "ANTHROPIC_API_KEY", None)

    ai = ChatModel(
        provider=provider,
        api_key=api_key,
        model_name=model_name,
        **AI_CONFIG
    )

    # 3. Appeler l'IA
    logger.info(f"🤖 Appel IA ({provider}/{ai.target_model_name})...")
    raw_response = await ai.generate_response(
        message=user_prompt,
        system_instruction=system_prompt
    )

    if not raw_response or raw_response.startswith("Error:"):
        logger.error(f"❌ Réponse IA invalide : {raw_response[:200]}")
        raise RuntimeError(f"AI Provider Error: {raw_response}")

    # 4. Parser la réponse
    analysis = parse_ai_response(raw_response)
    if not analysis:
        logger.error("❌ Parsing JSON échoué.")
        return None

    # 4b. Garantir un champ `outcome` structuré sur chaque sélection,
    # et un texte pour chacune des 4 langues (l'IA traduit en un seul appel —
    # voir prompt_builder.OUTPUT_FORMAT — ceci ne fait que combler les trous).
    analysis = normalize_outcome_fields(analysis)
    analysis = normalize_language_fields(analysis)

    # 5. Valider la structure
    if not validate_analysis(analysis):
        logger.warning("⚠️ Analyse incomplète mais retournée quand même.")

    # 6. Enrichir avec les métadonnées
    analysis["_meta"] = {
        "sport": sport,
        "match_id": match_id,
        "provider": provider,
        "model": ai.target_model_name,
    }

    logger.info(f"✅ Analyse générée : {analysis.get('data_quality', '?')} quality, structure full (9 évènements) respectée.")

    return analysis


# ═══════════════════════════════════════════════════════════════════
# CLI — Test direct
# ═══════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="BETIX — Générateur de Confiance IA")
    parser.add_argument("sport", choices=["football", "basketball", "tennis"])
    parser.add_argument("match_id", type=int)
    parser.add_argument("--provider", default="claude", choices=["gemini", "gpt", "claude"],
                        help="Fournisseur IA (défaut: claude)")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Nom du modèle spécifique")
    args = parser.parse_args()

    async def main():
        print(f"\n{'═' * 60}")
        print(f"  BETIX Confidence Generator — {args.sport.upper()} #{args.match_id}")
        print(f"  Provider: {args.provider} | Model: {args.model or 'default'}")
        print(f"{'═' * 60}\n")

        result = await generate_confidence(
            sport=args.sport,
            match_id=args.match_id,
            provider=args.provider,
            model_name=args.model,
        )

        if result:
            print(json.dumps(result, indent=2, ensure_ascii=False))
        else:
            print("❌ Échec de la génération. Vérifiez les logs.")

    logging.basicConfig(level=logging.INFO, format="%(message)s")
    asyncio.run(main())
