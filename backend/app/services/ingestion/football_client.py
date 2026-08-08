"""
BETIX — FootballClient
Concrete implementation of BaseSportClient for Football (API-Football v3).
Handles sport-specific transforms: fixtures, referee, weather, round.
"""

import logging
from typing import Optional

from .base_client import BaseSportClient
from .constants import FOOTBALL_LEAGUES, FOOTBALL_STATUS_MAP, ANALYTICS_TO_PUBLIC_STATUS, CURRENT_SEASON

logger = logging.getLogger("betix.ingestion.football")


class FootballClient(BaseSportClient):
    """Client d'ingestion pour le Football via API-Football v3."""

    sport = "football"
    base_url = "v3.football.api-sports.io"
    league_ids = FOOTBALL_LEAGUES
    status_map = FOOTBALL_STATUS_MAP

    # =========================================================================
    # ENDPOINTS
    # =========================================================================
    def _get_leagues_endpoint(self) -> str:
        return "/leagues"

    def _get_teams_endpoint(self) -> str:
        return "/teams"

    def _get_teams_params(self, league_api_id: int) -> dict:
        return {"league": league_api_id, "season": CURRENT_SEASON}

    def _get_matches_endpoint(self) -> str:
        return "/fixtures"

    def _get_matches_params(self, league_api_id: int, date: str) -> dict:
        return {
            "league": league_api_id,
            "season": CURRENT_SEASON,
            "from": date,
            "to": date,
        }

    def _get_live_matches_endpoint(self) -> str:
        return "/fixtures?live=all"

    def _get_matches_by_ids_endpoints(self, ids: list[int]) -> list[str]:
        # API-Football v3 supports batching with dash separator
        ids_str = "-".join(map(str, ids))
        return [f"/fixtures?ids={ids_str}"]

    def _get_analytics_matches_table(self) -> str:
        return "football_matches"

    # =========================================================================
    # TRANSFORMATIONS
    # =========================================================================
    def _transform_league(self, raw: dict, meta: dict) -> dict:
        """
        API-Football /leagues response → analytics.leagues row.
        raw = {"league": {...}, "country": {...}, "seasons": [...]}
        """
        league_data = raw.get("league", {})
        seasons = raw.get("seasons", [])
        current_season = None
        for s in seasons:
            if s.get("year") == CURRENT_SEASON:
                current_season = s
                break
        if not current_season and seasons:
            current_season = seasons[-1]  # fallback to latest

        return {
            "api_id": league_data.get("id"),
            "sport": self.sport,
            "name": meta.get("name", league_data.get("name", "")),
            "country": meta.get("country", ""),
            "tier": meta.get("tier", "major"),
            "season_start": current_season.get("start") if current_season else None,
            "season_end": current_season.get("end") if current_season else None,
        }

    def _transform_team(self, raw: dict, internal_league_id: int) -> dict:
        """
        API-Football /teams response → analytics.teams row.
        raw = {"team": {...}, "venue": {...}}
        """
        team_data = raw.get("team", {})
        venue_data = raw.get("venue", {})

        return {
            "api_id": team_data.get("id"),
            "sport": self.sport,
            "name": team_data.get("name", ""),
            "short_name": team_data.get("code", ""),
            "logo_url": team_data.get("logo", ""),
            "league_id": internal_league_id,
            "stadium_city": venue_data.get("city", ""),
            "stadium_lat": None,
            "stadium_lon": None,
        }

    def _transform_match(self, raw: dict) -> Optional[dict]:
        """
        API-Football /fixtures response → analytics.football_matches row.
        raw = {"fixture": {...}, "league": {...}, "teams": {...}, "goals": {...}, "score": {...}}
        """
        fixture = raw.get("fixture", {})
        league = raw.get("league", {})
        teams = raw.get("teams", {})
        goals = raw.get("goals", {})

        api_id = fixture.get("id")
        if not api_id:
            return None

        # Resolve internal IDs
        home_api_id = teams.get("home", {}).get("id")
        away_api_id = teams.get("away", {}).get("id")
        league_api_id = league.get("id")

        home_team_id = self._team_id_map.get(home_api_id)
        away_team_id = self._team_id_map.get(away_api_id)
        internal_league_id = self._league_id_map.get(league_api_id)

        if not home_team_id or not away_team_id or not internal_league_id:
            logger.warning(
                f"[football] Skipping match {api_id}: "
                f"unresolved IDs (home={home_api_id}, away={away_api_id}, league={league_api_id})"
            )
            return None

        api_status = fixture.get("status", {}).get("short", "NS")
        status = self.status_map.get(api_status, "scheduled")

        return {
            "api_id": api_id,
            "league_id": internal_league_id,
            "round": league.get("round", ""),
            "date_time": fixture.get("date"),
            "home_team_id": home_team_id,
            "away_team_id": away_team_id,
            "home_score": goals.get("home"),
            "away_score": goals.get("away"),
            "status": status,
            "referee_name": fixture.get("referee"),
            "stadium": fixture.get("venue", {}).get("name"),
            "weather": None,
        }

    def _build_public_match(self, analytics_row: dict) -> Optional[dict]:
        """
        Construit un objet public.matches depuis une ligne analytics.football_matches.
        """
        home_info = self._get_team_info(analytics_row.get("home_team_id"))
        away_info = self._get_team_info(analytics_row.get("away_team_id"))
        league_info = self._get_league_info(analytics_row.get("league_id"))

        if not home_info or not away_info:
            return None

        analytics_status = analytics_row.get("status", "scheduled")
        public_status = ANALYTICS_TO_PUBLIC_STATUS.get(analytics_status, "upcoming")

        score_obj = None
        if analytics_row.get("home_score") is not None:
            score_obj = {
                "home": analytics_row["home_score"],
                "away": analytics_row.get("away_score"),
            }

        meta = {}
        if analytics_row.get("round"):
            meta["round"] = analytics_row["round"]
        if analytics_row.get("referee_name"):
            meta["referee"] = analytics_row["referee_name"]
        if league_info:
            meta["country"] = league_info.get("country", "")

        return {
            "internal_match_id": analytics_row["id"],
            "api_sport_id": str(analytics_row["api_id"]),
            "sport": self.sport,
            "league_name": league_info.get("name", "") if league_info else "",
            "home_team": {
                "id": analytics_row.get("home_team_id"),
                "name": home_info.get("name", ""),
                "logo": home_info.get("logo_url", ""),
                "code": home_info.get("short_name", ""),
            },
            "away_team": {
                "id": analytics_row.get("away_team_id"),
                "name": away_info.get("name", ""),
                "logo": away_info.get("logo_url", ""),
                "code": away_info.get("short_name", ""),
            },
            "date_time": analytics_row.get("date_time"),
            "status": public_status,
            "score": score_obj,
            "tournament_meta": meta if meta else None,
        }

    # =========================================================================
    # HELPERS — Team & League info lookup via SupabaseREST
    # =========================================================================
    def _get_team_info(self, internal_id: int | None) -> Optional[dict]:
        """Fetch team info by internal DB id."""
        if not internal_id:
            return None
        rows = self.analytics.select("teams", "name,short_name,logo_url", {"id": internal_id}, limit=1)
        return rows[0] if rows else None

    def _get_league_info(self, internal_id: int | None) -> Optional[dict]:
        """Fetch league info by internal DB id."""
        if not internal_id:
            return None
        rows = self.analytics.select("leagues", "name,country", {"id": internal_id}, limit=1)
        return rows[0] if rows else None
