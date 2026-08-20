"""
BETIX — check_confidence_calibration.py
Empirical answer to "is 82% confidence actually right 82% of the time?"

Read-only. Uses data that already exists: every graded ai_match_audits row
has grading_results (per-category won/lost/push/ungraded counts, computed
by prediction_grading.py) and the original ai_analysis (with each pick's
self-reported confidence_score). Nothing today compares the two — this
script does, per category (high_confidence/medium_confidence/risky), which
is a reasonable proxy for "confidence band" since each category maps to a
fixed score range (80-99 / 60-79 / 30-59).

Usage:
    python draft/check_confidence_calibration.py
"""
import sys
import os
import json
from collections import defaultdict

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST

CATEGORY_KEYS = ("high_confidence", "medium_confidence", "risky")
SCORE_RANGES = {"high_confidence": "80-99", "medium_confidence": "60-79", "risky": "30-59"}


def main():
    settings = get_settings()
    db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="public")

    print("Fetching graded audits...")
    rows = db.select_raw(
        "ai_match_audits",
        "select=id,sport,ai_analysis,grading_results&graded_at=not.is.null&limit=5000",
    )
    print(f"Found {len(rows)} graded audits.\n")

    if not rows:
        print("Nothing graded yet — nothing to calibrate against.")
        return

    won = defaultdict(int)
    lost = defaultdict(int)
    push = defaultdict(int)
    ungraded = defaultdict(int)
    scores = defaultdict(list)

    for row in rows:
        analysis = row.get("ai_analysis")
        grading = row.get("grading_results")
        if isinstance(analysis, str):
            analysis = json.loads(analysis)
        if isinstance(grading, str):
            grading = json.loads(grading)
        if not analysis or not grading:
            continue

        categories = (analysis or {}).get("categories", {})
        for cat in CATEGORY_KEYS:
            counts = grading.get(cat) or {}
            won[cat] += counts.get("won", 0)
            lost[cat] += counts.get("lost", 0)
            push[cat] += counts.get("push", 0)
            ungraded[cat] += counts.get("ungraded", 0)

            for pick in categories.get(cat, []) or []:
                score = pick.get("confidence_score")
                if isinstance(score, (int, float)):
                    scores[cat].append(score)

    print("=" * 78)
    print("  CONFIDENCE CALIBRATION — claimed vs. actual")
    print("=" * 78)
    print(f"  {'Category':<18}{'Claimed range':<15}{'Avg claimed':<13}{'Actual win rate':<18}{'n (won+lost)'}")
    print("  " + "-" * 74)

    for cat in CATEGORY_KEYS:
        n_decided = won[cat] + lost[cat]
        win_rate = f"{won[cat] / n_decided * 100:.0f}%" if n_decided > 0 else "n/a"
        avg_claimed = f"{sum(scores[cat]) / len(scores[cat]):.0f}%" if scores[cat] else "n/a"
        print(f"  {cat:<18}{SCORE_RANGES[cat]:<15}{avg_claimed:<13}{win_rate:<18}{n_decided}"
              f"  (push={push[cat]}, ungraded={ungraded[cat]})")

    print("=" * 78)
    print("\nRead: if 'Avg claimed' is well above 'Actual win rate' for a category,")
    print("the model is systematically overconfident there. 'ungraded' picks used")
    print("an outcome type/market this system can't verify yet (see prediction_grading.py")
    print("module docstring) — they're excluded from the win-rate math, not counted as losses.")


if __name__ == "__main__":
    main()
