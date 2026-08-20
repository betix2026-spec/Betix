"""
BETIX — check_model_comparison.py
Runs the SAME real match through Haiku (current production model) and a
candidate Sonnet model, printing both outputs side by side. This is
deliberately NOT an automatic swap — DEFAULT_MODEL in confidence_generator.py
stays on Haiku until you've actually read this comparison and decided the
quality difference is worth the per-call cost increase. It also confirms
whether the candidate Sonnet model ID is even valid against your live
Anthropic key before anyone considers hardcoding it anywhere.

Usage:
    python draft/check_model_comparison.py <sport> <match_id> [--sonnet-model MODEL_ID]

The --sonnet-model default below is a best guess at the current Sonnet
model ID — VERIFY it's right (the script will tell you immediately if the
API rejects it) rather than assuming it's correct.
"""
import sys
import os
import json
import time
import asyncio
import argparse

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app.engine.confidence_generator import generate_confidence, DEFAULT_MODEL

CANDIDATE_SONNET_MODEL = "claude-sonnet-4-5-20250929"  # verify — not confirmed against a live key


def summarize(analysis, label, elapsed):
    print(f"\n{'=' * 70}\n  {label}  ({elapsed:.1f}s)\n{'=' * 70}")
    if not analysis:
        print("  ❌ No analysis returned (check logs above for the error).")
        return
    print(f"  data_quality: {analysis.get('data_quality')}")
    for cat in ("high_confidence", "medium_confidence", "risky"):
        picks = analysis.get("categories", {}).get(cat, [])
        print(f"\n  [{cat}] {len(picks)} pick(s)")
        for p in picks:
            market = (p.get("market") or {}).get("fr", p.get("market"))
            selection = (p.get("selection") or {}).get("fr", p.get("selection"))
            analysis_text = (p.get("analysis") or {}).get("fr", p.get("analysis"))
            print(f"    - {market}: {selection} | confidence={p.get('confidence_score')} | odds={p.get('odds')}")
            print(f"      {(analysis_text or '')[:220]}{'...' if analysis_text and len(analysis_text) > 220 else ''}")


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("sport", choices=["football", "basketball", "tennis"])
    parser.add_argument("match_id", type=int)
    parser.add_argument("--sonnet-model", default=CANDIDATE_SONNET_MODEL)
    args = parser.parse_args()

    print(f"Comparing models for {args.sport} #{args.match_id}")
    print(f"  Haiku:  {DEFAULT_MODEL}")
    print(f"  Sonnet: {args.sonnet_model} (candidate — will confirm if this ID is valid)")

    t0 = time.time()
    haiku_result = await generate_confidence(args.sport, args.match_id, provider="claude", model_name=DEFAULT_MODEL)
    haiku_elapsed = time.time() - t0
    summarize(haiku_result, f"HAIKU ({DEFAULT_MODEL})", haiku_elapsed)

    t0 = time.time()
    try:
        sonnet_result = await generate_confidence(args.sport, args.match_id, provider="claude", model_name=args.sonnet_model)
    except Exception as e:
        print(f"\n❌ Sonnet call failed — model ID likely wrong or unavailable: {e}")
        sonnet_result = None
    sonnet_elapsed = time.time() - t0
    summarize(sonnet_result, f"SONNET ({args.sonnet_model})", sonnet_elapsed)

    print(f"\n{'=' * 70}")
    print(f"  Latency: Haiku {haiku_elapsed:.1f}s vs Sonnet {sonnet_elapsed:.1f}s")
    print("  Read both analyses above for depth/specificity — that judgment call")
    print("  (is the difference worth the per-call cost increase?) is yours to make.")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
