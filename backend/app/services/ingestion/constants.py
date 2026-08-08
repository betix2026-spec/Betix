"""
BETIX — Ingestion Constants
Defines the target leagues and status mappings.
"""

CURRENT_SEASON = 2025  # 2024-2025 season (Pro plan active)

# =============================================================================
# FOOTBALL (API-Sports v3)
# =============================================================================
# Leagues: PL (39), Ligue 1 (61), Bundesliga (78), Serie A (135), La Liga (140)
FOOTBALL_LEAGUES = {
    39: {"name": "Premier League", "country": "England", "tier": "major"},
    61: {"name": "Ligue 1", "country": "France", "tier": "major"},
    78: {"name": "Bundesliga", "country": "Germany", "tier": "major"},
    135: {"name": "Serie A", "country": "Italy", "tier": "major"},
    140: {"name": "La Liga", "country": "Spain", "tier": "major"},
    2: {"name": "Champions League", "country": "Europe", "tier": "major"},
}

FOOTBALL_STATUS_MAP = {
    "TBD": "scheduled",
    "NS": "scheduled",
    "1H": "live",
    "HT": "live",
    "2H": "live",
    "ET": "live",
    "BT": "live",
    "P": "live",
    "SUSP": "live",
    "INT": "live",
    "FT": "finished",
    "AET": "finished",
    "PEN": "finished",
    "PST": "postponed",
    "CANC": "cancelled",
    "ABD": "abandoned",
    "AWD": "finished",
    "WO": "finished",
}

# =============================================================================
# BASKETBALL (API-Sports v1)
# =============================================================================
# Leagues: NBA (12), Euroleague (120)
BASKETBALL_LEAGUES = {
    12: {"name": "NBA", "country": "USA", "tier": "major"},
    120: {"name": "Euroleague", "country": "Europe", "tier": "major"},
    2: {"name": "LNB Pro A", "country": "France", "tier": "major"},
}

BASKETBALL_STATUS_MAP = {
    "NS": "scheduled",
    "Q1": "live",
    "Q2": "live",
    "Q3": "live",
    "Q4": "live",
    "OT": "live",
    "BT": "live",
    "HT": "live",
    "FT": "finished",
    "AOT": "finished",
    "POST": "postponed",
    "CANC": "cancelled",
    "SUSP": "suspended",
    "AWD": "finished",
}

# =============================================================================
# SHARED MAPPINGS (Analytics -> Public)
# =============================================================================
ANALYTICS_TO_PUBLIC_STATUS = {
    "scheduled": "upcoming",
    "imminent": "imminent",
    "live": "live",
    "finished": "finished",
    "postponed": "postponed",
    "cancelled": "cancelled",
    "abandoned": "finished",
}
