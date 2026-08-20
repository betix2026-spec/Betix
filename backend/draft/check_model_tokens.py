"""
BETIX — check_model_tokens.py
Runs the SAME real match through multiple candidate Claude models,
capturing real token usage (input/output/total) and latency for each —
direct Anthropic API calls, since the shared ChatModel wrapper
(ai_model.py) discards usage data. Builds the prompt once via the real
build_audit_prompt() so every model sees identical context — a fair,
apples-to-apples comparison, not a fresh fetch per model.

This does NOT change DEFAULT_MODEL anywhere — evaluation only.

Known model IDs as of writing (verify — Anthropic occasionally retires
older ones): claude-haiku-4-5-20251001 (current production default),
claude-sonnet-5, claude-opus-5. "Sonnet 4.6" was requested but this
environment has no confirmation that ID exists — claude-sonnet-4-5-20250929
(Sonnet 4.5) is included as the closest verified alternative below; the
script will report a clean per-model error rather than crash if any ID is
wrong, so trying an unconfirmed one is safe.

Usage:
    python draft/check_model_tokens.py football 16525
    python draft/check_model_tokens.py football 16525 --models claude-sonnet-5,claude-opus-5
"""
import sys
import os
import time
import asyncio
import argparse

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app.config import get_settings
from app.engine.prompt_builder import build_audit_prompt
from app.engine.confidence_generator import (
    parse_ai_response,
    normalize_outcome_fields,
    normalize_language_fields,
    validate_analysis,
    AI_CONFIG,
    DEFAULT_MODEL,
)

DEFAULT_MODELS = [
    DEFAULT_MODEL,                    # current production baseline (Haiku 4.5)
    "claude-sonnet-5",
    "claude-opus-5",
    "claude-sonnet-4-5-20250929",     # closest verified alt to the requested "Sonnet 4.6"
]


async def run_one(client, model, system_prompt, user_prompt, ceiling):
    t0 = time.time()
    try:
        response = await client.messages.create(
            model=model,
            messages=[{"role": "user", "content": user_prompt}],
            system=system_prompt,
            max_tokens=AI_CONFIG["max_tokens"],
            temperature=AI_CONFIG["temperature"],
            top_p=AI_CONFIG["top_p"],
            top_k=AI_CONFIG["top_k"],
        )
    except Exception as e:
        return {"model": model, "error": str(e), "elapsed": time.time() - t0}

    elapsed = time.time() - t0
    text = "".join(b.text for b in response.content if hasattr(b, "text"))
    analysis = parse_ai_response(text)
    if analysis:
        analysis = normalize_outcome_fields(analysis)
        analysis = normalize_language_fields(analysis)
        validate_analysis(analysis, ceiling=ceiling)

    usage = response.usage
    return {
        "model": model,
        "elapsed": elapsed,
        "input_tokens": usage.input_tokens,
        "output_tokens": usage.output_tokens,
        "total_tokens": usage.input_tokens + usage.output_tokens,
        "analysis": analysis,
    }


def summarize(result):
    print(f"\n{'=' * 70}\n  {result['model']}  ({result.get('elapsed', 0):.1f}s)\n{'=' * 70}")
    if "error" in result:
        print(f"  ❌ {result['error']}")
        return
    print(f"  Tokens: {result['input_tokens']} in / {result['output_tokens']} out / {result['total_tokens']} total")
    analysis = result.get("analysis")
    if not analysis:
        print("  ❌ Response did not parse as valid JSON.")
        return
    print(f"  data_quality: {analysis.get('data_quality')}")
    for cat in ("high_confidence", "medium_confidence", "risky"):
        picks = analysis.get("categories", {}).get(cat, [])
        print(f"\n  [{cat}] {len(picks)} pick(s)")
        for p in picks:
            market = (p.get("market") or {}).get("en", p.get("market"))
            selection = (p.get("selection") or {}).get("en", p.get("selection"))
            print(f"    - {market}: {selection} | confidence={p.get('confidence_score')} | odds={p.get('odds')}")


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("sport", choices=["football", "basketball", "tennis"])
    parser.add_argument("match_id", type=int)
    parser.add_argument("--models", default=None, help="Comma-separated model IDs, overrides the default list")
    args = parser.parse_args()

    models = args.models.split(",") if args.models else DEFAULT_MODELS

    settings = get_settings()
    from anthropic import AsyncAnthropic
    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    print(f"Building prompt once for {args.sport} #{args.match_id} (shared across all models)...")
    system_prompt, user_prompt, ceiling = await build_audit_prompt(args.sport, args.match_id)
    print(f"Confidence ceiling for this match: {ceiling}")
    print(f"Testing models: {', '.join(models)}")

    results = []
    for model in models:
        print(f"\n... running {model}")
        r = await run_one(client, model, system_prompt, user_prompt, ceiling)
        results.append(r)
        summarize(r)

    print(f"\n{'=' * 70}\n  TOKEN USAGE SUMMARY\n{'=' * 70}")
    print(f"  {'Model':<32}{'Input':>9}{'Output':>9}{'Total':>9}{'Time':>8}")
    print("  " + "-" * 66)
    for r in results:
        if "error" in r:
            print(f"  {r['model']:<32}ERROR: {r['error'][:45]}")
            continue
        print(f"  {r['model']:<32}{r['input_tokens']:>9}{r['output_tokens']:>9}{r['total_tokens']:>9}{r['elapsed']:>7.1f}s")


if __name__ == "__main__":
    asyncio.run(main())
