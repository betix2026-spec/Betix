"""
BETIX — tier_scope.py
Defines the "top tier" competitions: the ones that get proactive AI
generation (~24h before kickoff) and a confidence badge on the dashboard.

Out-of-scope matches stay visible and still generate an analysis on demand
if a premium user opens the page — they just don't get a badge or a
proactive pass. See the plan (Phase 0 / Phase 1).

Defined as data, not hardcoded logic, so the scope can be adjusted without
touching the generation engine.
"""

from typing import Optional

# =============================================================================
# FOOTBALL — league_id (analytics.leagues.api_id, see ingestion/constants.py)
# =============================================================================
FOOTBALL_TOP_TIER_LEAGUE_IDS = {
    39,   # Premier League
    2,    # Champions League
    140,  # La Liga
}

# =============================================================================
# BASKETBALL — all 3 tracked leagues are already "top tier" (nothing to exclude)
# =============================================================================
BASKETBALL_TOP_TIER_LEAGUE_IDS = {
    12,   # NBA
    120,  # Euroleague
    2,    # LNB Pro A
}

# =============================================================================
# TENNIS — no fixed "league": scope is defined by tournament category
# + tour gender (ATP = men only, see update_tennis_rankings.py)
# =============================================================================
TENNIS_TOP_TIER_CATEGORIES = {
    "grand_slam",
    "masters_1000",
    "atp_500",
}
TENNIS_TOP_TIER_TOUR = "ATP"  # excludes WTA


def is_football_top_tier(league_id: Optional[int]) -> bool:
    return league_id in FOOTBALL_TOP_TIER_LEAGUE_IDS


def is_basketball_top_tier(league_id: Optional[int]) -> bool:
    return league_id in BASKETBALL_TOP_TIER_LEAGUE_IDS


def is_tennis_top_tier(category: Optional[str], tour: Optional[str]) -> bool:
    return category in TENNIS_TOP_TIER_CATEGORIES and tour == TENNIS_TOP_TIER_TOUR
