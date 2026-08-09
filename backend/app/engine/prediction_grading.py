"""
BETIX — prediction_grading.py
Grades AI picks (ai_match_audits.ai_analysis) against a match's final
result, using the structured `outcome` field the AI attaches to every
pick (see prompt_builder.OUTPUT_FORMAT and confidence_generator.
normalize_outcome_fields). Powers Phase 3 (historic accuracy tracking).

Grading is per-pick ("won" / "lost" / "push" / "ungraded"), rolled up into
per-category counts stored on ai_match_audits.grading_results.

KNOWN LIMITATIONS (a pick is "ungraded" — excluded from win-rate math —
rather than guessed at):
- Tennis `over_under`: the DB only stores total sets played, not total
  games, so a games-based over/under line can't be checked. Use the
  dedicated `sets_total` type for tennis instead (that one IS graded).
- Tennis `correct_score`: the DB stores the winner and total sets played,
  but not the per-player set count split, and best-of-3 vs best-of-5
  isn't recorded — not enough to verify a "2-1"-style score reliably.
- `outcome.type == "other"`: used by the AI when no structured type fits;
  never auto-gradable by design (see prompt_builder.py).
"""

import logging
from typing import Any, Dict, Optional

from app.services.ingestion.base_client import SupabaseREST

logger = logging.getLogger("betix.prediction_grading")

CATEGORY_KEYS = ("high_confidence", "medium_confidence", "risky")

# Result values used throughout: "won" | "lost" | "push" | "ungraded"


# ═══════════════════════════════════════════════════════════════════
# MATCH RESULT FETCHING
# ═══════════════════════════════════════════════════════════════════

def fetch_match_result(db: SupabaseREST, sport: str, match_id: int) -> Optional[Dict[str, Any]]:
    """
    Fetches the final result for a match, only if it's finished.
    Returns None if the match isn't found or isn't finished yet.
    """
    if sport == "tennis":
        rows = db.select(
            "tennis_matches",
            "status,winner_id,player1_id,player2_id,sets_played",
            {"id": match_id},
        )
        if not rows or rows[0].get("status") != "finished":
            return None
        return rows[0]

    table = f"{sport}_matches"
    rows = db.select(table, "status,home_score,away_score", {"id": match_id})
    if not rows or rows[0].get("status") != "finished":
        return None
    row = rows[0]
    if row.get("home_score") is None or row.get("away_score") is None:
        return None
    return row


# ═══════════════════════════════════════════════════════════════════
# PER-PICK GRADING
# ═══════════════════════════════════════════════════════════════════

def _grade_moneyline(side: Any, sport: str, result: Dict[str, Any]) -> str:
    if sport == "tennis":
        winner_id = result.get("winner_id")
        if winner_id is None:
            return "ungraded"
        if side == "home":
            return "won" if winner_id == result.get("player1_id") else "lost"
        if side == "away":
            return "won" if winner_id == result.get("player2_id") else "lost"
        return "ungraded"

    home, away = result["home_score"], result["away_score"]
    if side == "home":
        return "won" if home > away else "lost"
    if side == "away":
        return "won" if away > home else "lost"
    if side == "draw":
        return "won" if home == away else "lost"
    return "ungraded"


def _grade_double_chance(side: Any, sport: str, result: Dict[str, Any]) -> str:
    if sport == "tennis" or "home_score" not in result:
        # No draw possible outside football — a double-chance pick here is
        # equivalent to a plain moneyline pick, but the AI shouldn't be
        # proposing this market for sports without a draw. Play it safe.
        return "ungraded"

    home, away = result["home_score"], result["away_score"]
    home_win, draw, away_win = home > away, home == away, away > home
    if side == "1X":
        return "won" if home_win or draw else "lost"
    if side == "X2":
        return "won" if draw or away_win else "lost"
    if side == "12":
        return "won" if home_win or away_win else "lost"
    return "ungraded"


def _grade_over_under(side: Any, line: Any, sport: str, result: Dict[str, Any]) -> str:
    if sport == "tennis" or line is None:
        return "ungraded"  # see module docstring: no total-games data for tennis
    try:
        line = float(line)
    except (TypeError, ValueError):
        return "ungraded"

    total = result["home_score"] + result["away_score"]
    if total == line:
        return "push"
    if side == "over":
        return "won" if total > line else "lost"
    if side == "under":
        return "won" if total < line else "lost"
    return "ungraded"


def _grade_handicap(side: Any, line: Any, sport: str, result: Dict[str, Any]) -> str:
    if sport == "tennis" or line is None:
        return "ungraded"
    try:
        line = float(line)
    except (TypeError, ValueError):
        return "ungraded"

    home, away = result["home_score"], result["away_score"]
    if side == "home":
        margin = (home - away) + line
    elif side == "away":
        margin = (away - home) + line
    else:
        return "ungraded"

    if margin == 0:
        return "push"
    return "won" if margin > 0 else "lost"


def _grade_btts(side: Any, sport: str, result: Dict[str, Any]) -> str:
    if sport != "football":
        return "ungraded"  # BTTS is a football-only market in the AI's prompt
    both_scored = result["home_score"] > 0 and result["away_score"] > 0
    if side == "yes":
        return "won" if both_scored else "lost"
    if side == "no":
        return "won" if not both_scored else "lost"
    return "ungraded"


def _grade_correct_score(side: Any, sport: str, result: Dict[str, Any]) -> str:
    if sport == "tennis" or not isinstance(side, str) or "-" not in side:
        return "ungraded"  # see module docstring: no per-player set split for tennis
    try:
        pred_home, pred_away = (int(part.strip()) for part in side.split("-", 1))
    except ValueError:
        return "ungraded"
    return "won" if (pred_home, pred_away) == (result["home_score"], result["away_score"]) else "lost"


def _grade_sets_total(side: Any, line: Any, sport: str, result: Dict[str, Any]) -> str:
    if sport != "tennis" or line is None:
        return "ungraded"
    sets_played = result.get("sets_played")
    if sets_played is None:
        return "ungraded"
    try:
        line = float(line)
    except (TypeError, ValueError):
        return "ungraded"

    if sets_played == line:
        return "push"
    if side == "over":
        return "won" if sets_played > line else "lost"
    if side == "under":
        return "won" if sets_played < line else "lost"
    return "ungraded"


def grade_selection(outcome: Optional[Dict[str, Any]], sport: str, result: Dict[str, Any]) -> str:
    """Grades a single pick's `outcome` field against the match result."""
    if not isinstance(outcome, dict):
        return "ungraded"

    outcome_type = outcome.get("type")
    side = outcome.get("side")
    line = outcome.get("line")

    if outcome_type == "moneyline":
        return _grade_moneyline(side, sport, result)
    if outcome_type == "double_chance":
        return _grade_double_chance(side, sport, result)
    if outcome_type == "over_under":
        return _grade_over_under(side, line, sport, result)
    if outcome_type == "handicap":
        return _grade_handicap(side, line, sport, result)
    if outcome_type == "btts":
        return _grade_btts(side, sport, result)
    if outcome_type == "correct_score":
        return _grade_correct_score(side, sport, result)
    if outcome_type == "sets_total":
        return _grade_sets_total(side, line, sport, result)
    return "ungraded"  # "other", or an unrecognized/missing type


# ═══════════════════════════════════════════════════════════════════
# FULL AUDIT GRADING
# ═══════════════════════════════════════════════════════════════════

def grade_audit(ai_analysis: Dict[str, Any], sport: str, result: Dict[str, Any]) -> Dict[str, Dict[str, int]]:
    """
    Grades every pick in an audit's ai_analysis, rolled up into per-category
    won/lost/push/ungraded counts. Returns the shape stored in
    ai_match_audits.grading_results.
    """
    categories = (ai_analysis or {}).get("categories", {})
    grading_results: Dict[str, Dict[str, int]] = {}

    for cat in CATEGORY_KEYS:
        counts = {"won": 0, "lost": 0, "push": 0, "ungraded": 0}
        for item in categories.get(cat, []) or []:
            outcome = item.get("outcome")
            verdict = grade_selection(outcome, sport, result)
            counts[verdict] = counts.get(verdict, 0) + 1
        grading_results[cat] = counts

    return grading_results
