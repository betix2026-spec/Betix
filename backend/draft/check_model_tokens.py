"""
BETIX — check_model_tokens.py
Runs the SAME real match through multiple candidate Claude models,
capturing real token usage (input/output/total) and latency for each —
direct Anthropic API calls, since the shared ChatModel wrapper
(ai_model.py) discards usage data. Builds the prompt once via the real
build_audit_prompt() so every model sees identical context — a fair,
apples-to-apples comparison, not a fresh fetch per model.

This does NOT change DEFAULT_MODEL anywhere — evaluation only.

Known model IDs: claude-haiku-4-5-20251001 (current production default),
claude-sonnet-5, claude-opus-5, claude-sonnet-4-6 (confirmed real — found
as the ai_model value on a real stored audit, see
draft/check_one_audit_shape.py's output). The script reports a clean
per-model error rather than crash if any ID turns out wrong.

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

# Hard wall-clock deadline per model call. claude-sonnet-4-6 legitimately
# took 224.5s in a real run — set well above that rather than cutting off a
# slow-but-working request.
REQUEST_DEADLINE_S = 300

DEFAULT_MODELS = [
    DEFAULT_MODEL,                    # current production baseline (Haiku 4.5)
    "claude-sonnet-5",
    "claude-opus-5",
    "claude-sonnet-4-6",              # confirmed real — found in ai_model on a stored audit
]


async def run_one(client, model, system_prompt, user_prompt, ceiling):
    t0 = time.time()
    kwargs = dict(
        model=model,
        messages=[{"role": "user", "content": user_prompt}],
        system=system_prompt,
        max_tokens=AI_CONFIG["max_tokens"],
        temperature=AI_CONFIG["temperature"],
    )
    try:
        # Only `temperature` — matches exactly what production actually sends
        # to Claude (ai_model.py's _generate_claude never passes top_p/top_k
        # despite AI_CONFIG having those keys; they're only used for the
        # Gemini path).
        # asyncio.wait_for wraps this as a HARD wall-clock deadline — the
        # client's own timeout=120.0 turned out to be a per-read timeout, not
        # a total-request one (confirmed live: a call took 224.5s and never
        # tripped it), so a genuinely stalled request could still hang past
        # what looks like a bounded timeout.
        response = await asyncio.wait_for(client.messages.create(**kwargs), timeout=REQUEST_DEADLINE_S)
    except asyncio.TimeoutError:
        return {"model": model, "error": f"Timed out after {REQUEST_DEADLINE_S}s (hard deadline)", "elapsed": time.time() - t0}
    except Exception as e:
        # The newest models (confirmed: Sonnet 5, Opus 5) reject `temperature`
        # outright ("deprecated for this model") — a different API surface
        # than Haiku/Sonnet-4-6, not something a fixed param set covers for
        # every model. Retry once without it before giving up.
        if "temperature" in str(e) and "deprecated" in str(e).lower():
            kwargs.pop("temperature")
            try:
                response = await asyncio.wait_for(client.messages.create(**kwargs), timeout=REQUEST_DEADLINE_S)
            except asyncio.TimeoutError:
                return {"model": model, "error": f"Timed out after {REQUEST_DEADLINE_S}s (hard deadline)", "elapsed": time.time() - t0}
            except Exception as e2:
                return {"model": model, "error": str(e2), "elapsed": time.time() - t0}
        else:
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
    # The real enforcement is asyncio.wait_for(..., REQUEST_DEADLINE_S) around
    # each call in run_one() — this client-level timeout is a secondary guard
    # (it's a per-read timeout, not a total-request one, so it alone doesn't
    # reliably cap a slow-but-progressing response).
    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=REQUEST_DEADLINE_S)

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
