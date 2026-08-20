"""
BETIX — confidence_ceiling.py
Computes a deterministic (non-LLM) ceiling on how high a confidence_score
is allowed to go for a given match, from real data-completeness signals —
league/tournament tier, whether odds exist, whether H2H exists. The LLM is
told the ceiling as a hard instruction in the prompt, and
confidence_generator.py enforces it server-side too (a prompt instruction
alone isn't trustworthy on its own — same reason validate_analysis()
clamps the fixed per-category bands rather than just logging).

This does NOT replace the LLM's own judgment about where its score lands
within the range it's allowed — it only caps how far that can run when the
underlying data is thin. Mirrors the malus-table approach from the
project's original (pre-build) RAG design doc (docs/rag_methodology.md),
which was never actually implemented until now.
"""
from typing import Any, Dict, Optional

BASE = 100
FLOOR = 30

TIER_MALUS_MID = 15
MISSING_ODDS_MALUS = 10
MISSING_H2H_MALUS = 10


def _has_odds(raw_context: Dict[str, Any]) -> bool:
    return bool(raw_context.get("odds"))


def _has_h2h(sport: str, raw_context: Dict[str, Any]) -> bool:
    h2h = raw_context.get("h2h") or {}
    if not h2h or h2h.get("summary") == "No H2H found":
        return False
    if sport == "tennis":
        return bool(h2h.get("last_5_meetings"))
    return True


def compute_confidence_ceiling(
    sport: str,
    raw_context: Dict[str, Any],
    is_top_tier: Optional[bool] = None,
) -> int:
    """
    is_top_tier: True/False if known (see app/engine/tier_scope.py), or None
    if the caller couldn't determine it (e.g. lookup failed) — treated as
    neutral rather than guessed at.
    """
    score = BASE

    if is_top_tier is False:
        score -= TIER_MALUS_MID

    if not _has_odds(raw_context):
        score -= MISSING_ODDS_MALUS

    if not _has_h2h(sport, raw_context):
        score -= MISSING_H2H_MALUS

    return max(FLOOR, score)
