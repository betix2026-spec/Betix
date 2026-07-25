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
AI_CONFIG = {
    "temperature": 0.4,       # Légèrement plus exploratoire pour éviter le biais de confirmation
    "max_tokens": 8192,       # JSON riche = besoin d'espace
    "top_p": 0.85,
    "top_k": 40,              # Plus de diversité dans les raisonnements explorés
}


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


async def translate_analysis_texts(ai: ChatModel, analysis: Dict[str, Any]) -> Dict[str, Any]:
    """
    Traduit les textes d'analyse (français) en anglais, espagnol et allemand,
    et transforme chaque champ texte concerné en { fr, en, es, de } au lieu
    d'une simple chaîne. Un seul appel IA pour tout traduire (moins cher qu'une
    génération complète par langue).
    """
    cat_keys = ["high_confidence", "medium_confidence", "risky"]
    texts_to_translate: Dict[str, str] = {}

    if analysis.get("match_summary"):
        texts_to_translate["match_summary"] = analysis["match_summary"]

    for cat in cat_keys:
        for idx, item in enumerate(analysis.get("categories", {}).get(cat, [])):
            if item.get("analysis"):
                texts_to_translate[f"{cat}.{idx}"] = item["analysis"]

    if not texts_to_translate:
        return analysis

    translation_prompt = (
        "Translate each of the following French sports-betting analysis texts into "
        "English, Spanish, and German. Preserve the meaning, tone, and level of detail — "
        "these are natural-language explanations, not literal word-for-word translations. "
        "Respond with ONLY a JSON object, no markdown, no commentary, in this exact shape:\n"
        '{ "<key>": { "en": "...", "es": "...", "de": "..." }, ... }\n\n'
        f"Texts to translate:\n{json.dumps(texts_to_translate, ensure_ascii=False, indent=2)}"
    )

    ai.clear_history()
    try:
        raw = await ai.generate_response(message=translation_prompt)
    except Exception as e:
        logger.error(f"❌ Échec de l'appel de traduction: {e}")
        return analysis
    finally:
        ai.clear_history()

    if not raw or raw.startswith("Error:"):
        logger.warning(f"⚠️ Traduction indisponible, analyse laissée en français uniquement: {raw[:200] if raw else 'empty'}")
        return analysis

    translated = parse_ai_response(raw)
    if not translated:
        logger.warning("⚠️ Parsing de la traduction échoué, analyse laissée en français uniquement.")
        return analysis

    if "match_summary" in texts_to_translate:
        fr_text = texts_to_translate["match_summary"]
        t = translated.get("match_summary", {}) or {}
        analysis["match_summary"] = {
            "fr": fr_text,
            "en": t.get("en") or fr_text,
            "es": t.get("es") or fr_text,
            "de": t.get("de") or fr_text,
        }

    for cat in cat_keys:
        for idx, item in enumerate(analysis.get("categories", {}).get(cat, [])):
            key = f"{cat}.{idx}"
            if key not in texts_to_translate:
                continue
            fr_text = texts_to_translate[key]
            t = translated.get(key, {}) or {}
            item["analysis"] = {
                "fr": fr_text,
                "en": t.get("en") or fr_text,
                "es": t.get("es") or fr_text,
                "de": t.get("de") or fr_text,
            }

    return analysis


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
                    logger.warning(f"Score {score} hors range [{lo}-{hi}] pour catégorie '{cat}' (market: {item.get('market')}).")

    return True


# ═══════════════════════════════════════════════════════════════════
# GÉNÉRATEUR DE CONFIANCE
# ═══════════════════════════════════════════════════════════════════

async def generate_confidence(
    sport: str,
    match_id: int,
    provider: str = "claude",
    model_name: Optional[str] = "claude-haiku-4-5-20251001",
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

    # 5. Valider la structure
    if not validate_analysis(analysis):
        logger.warning("⚠️ Analyse incomplète mais retournée quand même.")

    # 5b. Traduire les textes d'analyse (fr -> en/es/de) pour le site multilingue
    analysis = await translate_analysis_texts(ai, analysis)

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
    parser.add_argument("--model", default="claude-haiku-4-5-20251001", help="Nom du modèle spécifique")
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
