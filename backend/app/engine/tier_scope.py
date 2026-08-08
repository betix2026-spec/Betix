"""
BETIX — tier_scope.py
Définit les compétitions "top tier" : celles qui reçoivent une génération IA
proactive (~24h avant coup d'envoi) et un badge de confiance sur le dashboard.

Les matchs hors scope restent visibles et génèrent toujours une analyse à la
demande si un utilisateur premium ouvre la fiche — ils n'ont simplement pas de
badge et pas de passage proactif. Voir le plan (Phase 0 / Phase 1).

Défini comme donnée, pas comme logique câblée en dur, pour pouvoir ajuster le
scope sans toucher au moteur de génération.
"""

from typing import Optional

# =============================================================================
# FOOTBALL — league_id (analytics.leagues.api_id, cf. ingestion/constants.py)
# =============================================================================
FOOTBALL_TOP_TIER_LEAGUE_IDS = {
    39,   # Premier League
    2,    # Champions League
    140,  # La Liga
}

# =============================================================================
# BASKETBALL — les 3 ligues suivies sont déjà toutes "top tier" (aucune à exclure)
# =============================================================================
BASKETBALL_TOP_TIER_LEAGUE_IDS = {
    12,   # NBA
    120,  # Euroleague
    2,    # LNB Pro A
}

# =============================================================================
# TENNIS — pas de "ligue" fixe : le scope est défini par catégorie de tournoi
# + genre du tour (ATP = hommes uniquement, cf. update_tennis_rankings.py)
# =============================================================================
TENNIS_TOP_TIER_CATEGORIES = {
    "grand_slam",
    "masters_1000",
    "atp_500",
}
TENNIS_TOP_TIER_TOUR = "ATP"  # exclut WTA


def is_football_top_tier(league_id: Optional[int]) -> bool:
    return league_id in FOOTBALL_TOP_TIER_LEAGUE_IDS


def is_basketball_top_tier(league_id: Optional[int]) -> bool:
    return league_id in BASKETBALL_TOP_TIER_LEAGUE_IDS


def is_tennis_top_tier(category: Optional[str], tour: Optional[str]) -> bool:
    return category in TENNIS_TOP_TIER_CATEGORIES and tour == TENNIS_TOP_TIER_TOUR
