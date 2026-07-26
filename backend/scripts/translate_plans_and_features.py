"""
BETIX — One-time translation pass for plans and feature_definitions
Translates existing French plan names/descriptions and feature labels/
descriptions into English, Spanish, and German, using the same AI
translation approach as the match-analysis fix.

This is a DRAFT pass, not a final answer: it fills in the *_en/_es/_de
columns so the pricing page stops showing raw French to non-French
visitors, but the wording is AI-generated and should be reviewed (and
edited, if needed) in the admin plan/feature editor before you're fully
happy with it.

Safe to re-run: only fields that are currently empty get filled in, so it
never overwrites a translation you've already written by hand.

Usage:
    # Preview what would be translated, writes nothing:
    python -m scripts.translate_plans_and_features

    # Actually write the translations to Supabase:
    python -m scripts.translate_plans_and_features --apply
"""

import argparse
import asyncio
import json
import logging
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST
from app.engine.ai_model import ChatModel

logger = logging.getLogger("betix.translate_plans_and_features")
logging.basicConfig(level=logging.INFO, format="%(message)s")


def get_client() -> SupabaseREST:
    settings = get_settings()
    return SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)


def collect_plan_texts(plans: list[dict]) -> dict[str, str]:
    texts: dict[str, str] = {}
    for plan in plans:
        if plan.get("name") and not (plan.get("name_en") and plan.get("name_es") and plan.get("name_de")):
            texts[f"plan.{plan['id']}.name"] = plan["name"]
        if plan.get("description") and not (
            plan.get("description_en") and plan.get("description_es") and plan.get("description_de")
        ):
            texts[f"plan.{plan['id']}.description"] = plan["description"]
    return texts


def collect_feature_texts(features: list[dict]) -> dict[str, str]:
    texts: dict[str, str] = {}
    for feat in features:
        if feat.get("label") and not (feat.get("label_en") and feat.get("label_es") and feat.get("label_de")):
            texts[f"feature.{feat['id']}.label"] = feat["label"]
        if feat.get("description") and not (
            feat.get("description_en") and feat.get("description_es") and feat.get("description_de")
        ):
            texts[f"feature.{feat['id']}.description"] = feat["description"]
    return texts


async def translate_texts(texts: dict[str, str]) -> dict[str, dict]:
    if not texts:
        return {}

    settings = get_settings()
    ai = ChatModel(
        provider="claude",
        api_key=getattr(settings, "ANTHROPIC_API_KEY", None),
        model_name="claude-haiku-4-5-20251001",
        temperature=0.3,
        max_tokens=4096,
    )

    prompt = (
        "Translate each of the following French SaaS pricing-page texts (plan names, plan "
        "taglines, and feature labels/descriptions for a sports-prediction subscription "
        "product) into English, Spanish, and German. Keep names short and product-like — "
        "don't over-translate brand-style plan names if they read fine as-is. Respond with "
        "ONLY a JSON object, no markdown, no commentary, in this exact shape:\n"
        '{ "<key>": { "en": "...", "es": "...", "de": "..." }, ... }\n\n'
        f"Texts to translate:\n{json.dumps(texts, ensure_ascii=False, indent=2)}"
    )

    raw = await ai.generate_response(message=prompt)
    if not raw or raw.startswith("Error:"):
        raise RuntimeError(f"AI translation call failed: {raw}")

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        import re
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        raise RuntimeError(f"Could not parse AI translation response: {raw[:300]}")


async def main(apply: bool):
    client = get_client()

    plans = client.select("plans")
    features = client.select("feature_definitions")

    plan_texts = collect_plan_texts(plans)
    feature_texts = collect_feature_texts(features)
    all_texts = {**plan_texts, **feature_texts}

    if not all_texts:
        logger.info("Nothing to translate — every plan/feature already has en/es/de filled in.")
        return

    logger.info(f"Found {len(all_texts)} text field(s) needing translation:")
    for key, value in all_texts.items():
        logger.info(f"  - {key}: {value!r}")

    translated = await translate_texts(all_texts)

    plan_updates: dict[str, dict] = {}
    feature_updates: dict[str, dict] = {}

    for key, langs in translated.items():
        parts = key.split(".", 2)
        if len(parts) != 3:
            continue
        kind, entity_id, field = parts
        update_bucket = plan_updates if kind == "plan" else feature_updates
        entry = update_bucket.setdefault(entity_id, {})
        entry[f"{field}_en"] = langs.get("en")
        entry[f"{field}_es"] = langs.get("es")
        entry[f"{field}_de"] = langs.get("de")

    logger.info("\n--- Draft translations ---")
    for plan_id, updates in plan_updates.items():
        logger.info(f"plans.{plan_id}: {updates}")
    for feat_id, updates in feature_updates.items():
        logger.info(f"feature_definitions.{feat_id}: {updates}")

    if not apply:
        logger.info("\nDry run only — nothing was written. Re-run with --apply to save these to Supabase.")
        return

    for plan_id, updates in plan_updates.items():
        client.update("plans", updates, {"id": plan_id})
        logger.info(f"Updated plans.{plan_id}")

    for feat_id, updates in feature_updates.items():
        client.update("feature_definitions", updates, {"id": feat_id})
        logger.info(f"Updated feature_definitions.{feat_id}")

    logger.info("\nDone. Review the results in the admin plan/feature editor and adjust wording as needed.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="One-time AI translation draft for plans and feature_definitions")
    parser.add_argument("--apply", action="store_true", help="Actually write translations to Supabase (default: dry run)")
    args = parser.parse_args()
    asyncio.run(main(apply=args.apply))
