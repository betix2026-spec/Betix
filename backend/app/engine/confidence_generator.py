"""
BETIX — confidence_generator.py
Generates AI confidence analyses for sports matches.

Flow: Aggregator → Prompt Builder → ChatModel (Gemini/GPT/Claude) → structured JSON

CLI usage:
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
# AI CONFIGURATION
# ═══════════════════════════════════════════════════════════════════

# Config optimized for betting analysis (structured JSON, not creative)
# max_tokens raised (8192 -> 11000) because the analysis and its 4-language
# translation are now produced in a SINGLE call instead of two.
AI_CONFIG = {
    "temperature": 0.4,       # Slightly exploratory to avoid confirmation bias
    "max_tokens": 11000,      # Rich JSON + 4 languages needs room
    "top_p": 0.85,
    "top_k": 40,              # More diversity in the reasoning explored
}

DEFAULT_MODEL = "claude-sonnet-5"


# ═══════════════════════════════════════════════════════════════════
# AI RESPONSE PARSING
# ═══════════════════════════════════════════════════════════════════

def parse_ai_response(raw: str) -> Optional[Dict[str, Any]]:
    """
    Parses the raw AI response to extract the structured JSON.
    Handles cases where the AI wraps the JSON in markdown (```json ... ```).
    """
    if not raw:
        return None

    # Attempt 1: direct JSON
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # Attempt 2: extract the ```json ... ``` block
    match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass

    # Attempt 3: find the first { ... } in the text
    match = re.search(r'\{.*\}', raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    logger.error("❌ Could not parse the AI response. Exporting the full raw output to debug_ai_raw.log")
    try:
        with open("debug_ai_raw.log", "w", encoding="utf-8") as f:
            f.write(raw)
    except Exception as e:
        logger.error(f"Failed to write debug log: {e}")

    return None


LANGS = ("fr", "en", "es", "de")


def normalize_language_fields(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    The model now produces `match_summary`/`market`/`selection`/`analysis`
    directly in 4 languages in a single call (see prompt_builder.OUTPUT_FORMAT) —
    there is no more separate translation call. This function only backfills
    a missing language with the French text if the model forgot one, so no
    field is ever empty on the frontend.
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
    Guarantees that every pick carries a valid, structured `outcome` field,
    even if the model omitted it or invented a `type` outside the taxonomy —
    so automatic grading (Phase 3) never has to null-check this field.
    """
    categories = data.get("categories", {})
    for cat in ("high_confidence", "medium_confidence", "risky"):
        for item in categories.get(cat, []):
            outcome = item.get("outcome")
            if not isinstance(outcome, dict) or outcome.get("type") not in VALID_OUTCOME_TYPES:
                item["outcome"] = {"type": "other", "side": None, "line": None}
    return data


def validate_analysis(data: Dict[str, Any], ceiling: Optional[int] = None) -> bool:
    """Checks that the AI's JSON contains the required fields, and clamps
    each pick's confidence_score to its category's band and (if given) the
    match's data-completeness ceiling — the LLM is instructed to respect
    both in the prompt, but a prompt instruction alone isn't trustworthy,
    so this enforces it rather than just logging a mismatch."""
    required = ["match_summary", "data_quality", "categories"]
    missing = [k for k in required if k not in data]
    if missing:
        logger.warning(f"Missing fields in the analysis: {missing}")
        return False

    categories = data.get("categories", {})
    cat_keys = ["high_confidence", "medium_confidence", "risky"]
    missing_cats = [k for k in cat_keys if k not in categories]
    if missing_cats:
        logger.warning(f"Missing categories: {missing_cats}")
        return False

    for cat in cat_keys:
        items = categories.get(cat, [])
        if not isinstance(items, list) or len(items) > 3:
            logger.warning(f"Invalid category '{cat}' (size: {len(items) if isinstance(items, list) else 'non-list'}, max: 3).")
            return False

    # At least 1 bet total across all categories
    total_bets = sum(len(categories.get(c, [])) for c in cat_keys)
    if total_bets < 1:
        logger.warning("No pick proposed in the analysis.")
        return False

    # Confidence scores: clamp to the category's band, and to the match's
    # data-completeness ceiling if one was computed (see confidence_ceiling.py).
    # Previously this only logged a warning and left an out-of-range score
    # untouched — the "80-99/60-79/30-59" promise was never actually enforced.
    score_ranges = {"high_confidence": (80, 99), "medium_confidence": (60, 79), "risky": (30, 59)}
    for cat in cat_keys:
        for item in categories.get(cat, []):
            score = item.get("confidence_score")
            if score is None:
                continue
            lo, hi = score_ranges[cat]
            if ceiling is not None:
                hi = min(hi, ceiling)
            # If the ceiling collapsed below this category's own floor (e.g. a
            # HIGH pick, band 80-99, on a match with a ceiling of 60), the
            # ceiling wins — clamp down to it rather than forcing the score
            # back up to `lo`, which would silently ignore the ceiling.
            clamped = min(hi, score) if hi < lo else max(lo, min(hi, score))
            if clamped != score:
                market_label = (item.get("market") or {}).get("fr", item.get("market"))
                logger.warning(
                    f"Clamped confidence_score {score} -> {clamped} for category '{cat}' "
                    f"(band [{lo}-{hi}], ceiling={ceiling}, market: {market_label})."
                )
                item["confidence_score"] = clamped

    return True


# ═══════════════════════════════════════════════════════════════════
# CONFIDENCE GENERATOR
# ═══════════════════════════════════════════════════════════════════

async def generate_confidence(
    sport: str,
    match_id: int,
    provider: str = "claude",
    model_name: Optional[str] = DEFAULT_MODEL,
    context: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """
    Generates an AI confidence analysis for a given match.

    Args:
        sport: "football", "basketball", or "tennis"
        match_id: internal match ID
        provider: AI provider ("gemini", "gpt", "claude")
        model_name: specific model (optional)

    Returns:
        Structured JSON dict with the analysis, or None on error.
    """
    # 1. Build the prompts via prompt_builder
    logger.info(f"🎯 Generating confidence for {sport} #{match_id} (provider={provider})")

    try:
        system_prompt, user_prompt, ceiling = await build_audit_prompt(sport, match_id, context=context)
    except (ValueError, RuntimeError) as e:
        logger.error(f"❌ prompt_builder error: {e}")
        return None

    # 2. Initialize the AI model
    settings = get_settings()

    # Fetch the API key for the provider
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

    # 3. Call the AI
    logger.info(f"🤖 Calling AI ({provider}/{ai.target_model_name})...")
    raw_response = await ai.generate_response(
        message=user_prompt,
        system_instruction=system_prompt
    )

    if not raw_response or raw_response.startswith("Error:"):
        logger.error(f"❌ Invalid AI response: {raw_response[:200]}")
        raise RuntimeError(f"AI Provider Error: {raw_response}")

    # 4. Parse the response
    analysis = parse_ai_response(raw_response)
    if not analysis:
        logger.error("❌ JSON parsing failed.")
        return None

    # 4b. Guarantee a structured `outcome` field on every pick, and a text
    # for each of the 4 languages (the AI translates in a single call —
    # see prompt_builder.OUTPUT_FORMAT — this only backfills gaps).
    analysis = normalize_outcome_fields(analysis)
    analysis = normalize_language_fields(analysis)

    # 5. Validate the structure, and clamp scores to their band + the
    # computed ceiling (see build_audit_prompt/confidence_ceiling.py)
    if not validate_analysis(analysis, ceiling=ceiling):
        logger.warning("⚠️ Incomplete analysis, returned anyway.")

    # 6. Enrich with metadata
    analysis["_meta"] = {
        "sport": sport,
        "match_id": match_id,
        "provider": provider,
        "model": ai.target_model_name,
    }

    logger.info(f"✅ Analysis generated: {analysis.get('data_quality', '?')} quality, full structure respected.")

    return analysis


# ═══════════════════════════════════════════════════════════════════
# CLI — Direct test
# ═══════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="BETIX — AI Confidence Generator")
    parser.add_argument("sport", choices=["football", "basketball", "tennis"])
    parser.add_argument("match_id", type=int)
    parser.add_argument("--provider", default="claude", choices=["gemini", "gpt", "claude"],
                        help="AI provider (default: claude)")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Specific model name")
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
            print("❌ Generation failed. Check the logs.")

    logging.basicConfig(level=logging.INFO, format="%(message)s")
    asyncio.run(main())
