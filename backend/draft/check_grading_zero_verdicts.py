"""
BETIX — check_grading_zero_verdicts.py
Diagnostic for why check_confidence_calibration.py found 0 won/lost verdicts
across 1000 graded audits (all "ungraded"). Hypothesis: grade_selection()
returns "ungraded" whenever a pick's `outcome` field is missing or its type
isn't recognized (see prediction_grading.py) — and the structured `outcome`
field was only added to the prompt as part of Phase 3 (accuracy tracking),
so audits generated BEFORE that exist in the DB with no `outcome` at all.
grade_predictions_pass.py has been grading old and new audits alike since
Phase 3 shipped, so the "graded" population is likely dominated by old,
outcome-less rows.

This checks that hypothesis directly: samples graded audits, tabulates
outcome.type across every pick, and reports the attempted_at date range for
rows with no usable outcome vs. rows that do.

Usage:
    python draft/check_grading_zero_verdicts.py
"""
import sys
import os
import json
from collections import Counter

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST

VALID_OUTCOME_TYPES = {
    "moneyline", "double_chance", "over_under", "handicap",
    "btts", "correct_score", "sets_total",
}


def main():
    settings = get_settings()
    db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="public")

    rows = db.select_raw(
        "ai_match_audits",
        "select=id,sport,attempted_at,ai_analysis,grading_results&graded_at=not.is.null&limit=1000",
    )
    print(f"Sampled {len(rows)} graded audits.\n")

    type_counts = Counter()
    no_outcome_dates = []
    has_outcome_dates = []
    total_picks = 0

    for row in rows:
        analysis = row.get("ai_analysis")
        if isinstance(analysis, str):
            analysis = json.loads(analysis)
        if not analysis:
            continue
        categories = analysis.get("categories", {})
        row_has_real_outcome = False
        for cat in ("high_confidence", "medium_confidence", "risky"):
            for pick in categories.get(cat, []) or []:
                total_picks += 1
                outcome = pick.get("outcome")
                if not isinstance(outcome, dict):
                    type_counts["<missing outcome field>"] += 1
                    continue
                t = outcome.get("type")
                type_counts[t if t in VALID_OUTCOME_TYPES else f"<unrecognized: {t}>"] += 1
                if t in VALID_OUTCOME_TYPES:
                    row_has_real_outcome = True

        if row_has_real_outcome:
            has_outcome_dates.append(row.get("attempted_at"))
        else:
            no_outcome_dates.append(row.get("attempted_at"))

    print("=" * 70)
    print("  outcome.type DISTRIBUTION (across every pick in the sample)")
    print("=" * 70)
    for t, count in type_counts.most_common():
        pct = count / total_picks * 100 if total_picks else 0
        print(f"  {t:<35}{count:>6}  ({pct:.1f}%)")

    print(f"\n  Total picks examined: {total_picks}")

    print("\n" + "=" * 70)
    print("  ATTEMPTED_AT DATE RANGE — audits with a usable outcome vs. without")
    print("=" * 70)
    has_dates_clean = sorted(d for d in has_outcome_dates if d)
    no_dates_clean = sorted(d for d in no_outcome_dates if d)
    if has_dates_clean:
        print(f"  WITH a real outcome type   : {has_dates_clean[0]}  to  {has_dates_clean[-1]}  (n={len(has_dates_clean)})")
    else:
        print("  WITH a real outcome type   : none found in this sample")
    if no_dates_clean:
        print(f"  WITHOUT (missing/'other')  : {no_dates_clean[0]}  to  {no_dates_clean[-1]}  (n={len(no_dates_clean)})")
        print(f"  Most recent 5 WITHOUT an outcome: {no_dates_clean[-5:]}")
    else:
        print("  WITHOUT (missing/'other')  : none found in this sample")

    missing_attempted_at = sum(1 for d in no_outcome_dates if not d) + sum(1 for d in has_outcome_dates if not d)
    if missing_attempted_at:
        print(f"\n  ({missing_attempted_at} row(s) had no attempted_at at all — excluded from the range above)")

    print("\nRead: if the 'WITHOUT' date range is entirely older than 'WITH', that")
    print("confirms the structured outcome field was added partway through this")
    print("system's history — old audits will never gain one retroactively, so")
    print("they'll stay 'ungraded' forever. That's expected, not a new bug, and")
    print("resolves itself as old audits age out / new ones get played and graded.")
    print("If the two date ranges overlap heavily instead, something else is wrong")
    print("with the LLM reliably producing outcome fields even now — worth a")
    print("closer look at prompt_builder.OUTPUT_FORMAT compliance.")


if __name__ == "__main__":
    main()
