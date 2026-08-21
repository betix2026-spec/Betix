"""
BETIX — delta_gate.py
Deterministic (non-LLM) check for whether the ~1h-before-kickoff delta pass
actually needs an AI call. Compares the fresh data the delta pass just
re-fetched against what the ~24h-out initial analysis was generated from —
persisted on the same ai_match_audits row (odds/h2h/rolling_stats/injuries).
If nothing material differs, the delta pass skips the AI call entirely and
carries the original analysis forward with changed=false — real savings,
not narrative: per the delta prompt's own instructions to the model, a
"nothing changed" confirmation is the expected common case, not the
exception, for a 1-hour window.

This is a may-need-a-call filter, not a certainty. It only ever decides to
SKIP the AI call when confident nothing worth re-checking moved; any
ambiguity (no stored baseline, unparseable odds) falls through to "call
the AI" — never the other way. The AI itself remains the final word: even
a match this filter flags as "changed" can still have the model conclude
nothing actually needed updating (see confidence_generator.generate_delta_
confidence's own changed=false path).
"""

import json
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger("betix.delta_gate")

# How many percentage points a side's market-implied win probability has to
# move before it's treated as material rather than noise.
IMPLIED_PROB_SHIFT_THRESHOLD = 5

# Raw market_name as actually written to odds_snapshots (see
# scripts/updates/upsert_odds.py's per-sport market lists) — football's
# primary market is genuinely named "Match Winner"; basketball/tennis both
# use "Home/Away". Mirrors PRIMARY_MARKET in frontend/src/app/actions/
# matchList.ts — keep in sync if either side's market naming changes.
PRIMARY_MARKET = {"football": "Match Winner", "basketball": "Home/Away", "tennis": "Home/Away"}


def _as_dict(value: Any) -> Optional[Any]:
    """JSONB columns sometimes come back as a string, sometimes already
    parsed, depending on the client — normalize defensively, same
    convention as run_delta_audit's own previous_analysis handling."""
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (ValueError, TypeError):
            return None
    return value


def _implied_probs(selections: Any) -> Optional[Dict[str, float]]:
    """De-vigged implied win% per side — same math as data_aggregation.
    DataAggregator._implied_probabilities, but returning raw numbers
    instead of a formatted string, for a numeric threshold comparison."""
    selections = _as_dict(selections)
    if not isinstance(selections, list):
        return None
    home = away = draw = None
    for s in selections:
        if not isinstance(s, dict):
            continue
        label = str(s.get("label", "")).strip().lower()
        odds = s.get("odds")
        if not odds or odds <= 0:
            continue
        if label == "home":
            home = odds
        elif label == "away":
            away = odds
        elif label == "draw":
            draw = odds
    if not home or not away:
        return None
    inv_home, inv_away = 1 / home, 1 / away
    inv_draw = (1 / draw) if draw else 0
    total = inv_home + inv_away + inv_draw
    if total <= 0:
        return None
    return {
        "home": inv_home / total * 100,
        "away": inv_away / total * 100,
        "draw": (inv_draw / total * 100) if draw else 0,
    }


def _primary_market_probs(odds_ctx: Optional[Dict[str, Any]], sport: str) -> Optional[Dict[str, float]]:
    odds_ctx = _as_dict(odds_ctx)
    if not odds_ctx:
        return None
    market = odds_ctx.get(PRIMARY_MARKET.get(sport, ""))
    if not market:
        return None
    return _implied_probs(market.get("odds_data"))


def _odds_changed(old_odds: Optional[Dict[str, Any]], new_odds: Optional[Dict[str, Any]], sport: str) -> bool:
    old_probs = _primary_market_probs(old_odds, sport)
    new_probs = _primary_market_probs(new_odds, sport)
    if old_probs is None and new_probs is None:
        return False
    if (old_probs is None) != (new_probs is None):
        # Odds appeared or disappeared entirely since the initial pass —
        # a real change in what's known, not noise.
        return True
    return any(
        abs(old_probs.get(side, 0) - new_probs.get(side, 0)) >= IMPLIED_PROB_SHIFT_THRESHOLD
        for side in ("home", "away", "draw")
    )


def _injuries_changed(old_injuries: Optional[Dict[str, List[str]]], new_injuries: Optional[Dict[str, List[str]]]) -> bool:
    old_injuries = _as_dict(old_injuries)
    new_injuries = _as_dict(new_injuries) or {"home": [], "away": []}
    if old_injuries is None:
        # No stored baseline (row predates this column, or the initial
        # fetch failed) — can't prove nothing changed, so only treat as
        # unchanged if the fresh fetch is also genuinely empty.
        return bool(new_injuries.get("home")) or bool(new_injuries.get("away"))
    return any(
        set(old_injuries.get(side) or []) != set(new_injuries.get(side) or [])
        for side in ("home", "away")
    )


def _h2h_changed(old_h2h: Optional[Dict[str, Any]], new_h2h: Optional[Dict[str, Any]]) -> bool:
    old_h2h = _as_dict(old_h2h) or {}
    new_h2h = _as_dict(new_h2h) or {}
    keys = ("total_matches", "team_a_wins", "team_b_wins", "draws")
    return any(old_h2h.get(k) != new_h2h.get(k) for k in keys)


def _rolling_stats_changed(old_essential_stats: Optional[Dict[str, Any]], new_essential_stats: Optional[Dict[str, Any]]) -> bool:
    old_essential_stats = _as_dict(old_essential_stats) or {}
    new_essential_stats = new_essential_stats or {}
    return (
        old_essential_stats.get("home") != new_essential_stats.get("home")
        or old_essential_stats.get("away") != new_essential_stats.get("away")
    )


def has_material_change(
    existing_row: Dict[str, Any],
    fresh_context: Dict[str, Any],
    fresh_essential_stats: Dict[str, Any],
    sport: str,
) -> bool:
    """True if the delta pass should call the AI; False if it's safe to
    carry the original analysis forward unchanged at zero AI cost."""
    if _odds_changed(existing_row.get("odds"), fresh_context.get("odds"), sport):
        return True
    if sport == "football" and _injuries_changed(existing_row.get("injuries"), fresh_context.get("injuries")):
        return True
    if _h2h_changed(existing_row.get("h2h"), fresh_context.get("h2h")):
        return True
    if _rolling_stats_changed(existing_row.get("rolling_stats"), fresh_essential_stats):
        return True
    return False
