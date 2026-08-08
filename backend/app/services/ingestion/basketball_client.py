"""
BETIX — BasketballClient
Concrete implementation of BaseSportClient for Basketball (API-Basketball v1).
Handles sport-specific transforms: games, quarter-by-quarter scores.
"""

import logging
from typing import Optional

from .base_client import BaseSportClient
from .constants import BASKETBALL_LEAGUES, BASKETBALL_STATUS_MAP, ANALYTICS_TO_PUBLIC_STATUS, CURRENT_SEASON

logger = logging.getLogger("betix.ingestion.basketball")


class BasketballClient(BaseSportClient):
    """Client d'ingestion pour le Basketball via API-Basketball v1."""

    sport = "basketball"
    base_url = "v1.basketball.api-sports.io"
    league_ids = BASKETBALL_LEAGUES
    status_map = BASKETBALL_STATUS_MAP

    # =========================================================================
    # ENDPOINTS
    # =========================================================================
    def _get_season_string(self, league_api_id: int) -> str:
        """
        API-Basketball uses different season formats per league.
        Euroleague (120) & Pro A (2) -> 2025
        NBA (12) -> 2025-2026
        """
        if league_api_id == 12:  # NBA
            return f"{CURRENT_SEASON}-{CURRENT_SEASON + 1}"
        return str(CURRENT_SEASON)

    def _get_leagues_endpoint(self) -> str:
        return "/leagues"

    def _get_teams_endpoint(self) -> str:
        return "/teams"

    def _get_teams_params(self, league_api_id: int) -> dict:
        return {
            "league": league_api_id,
            "season": self._get_season_string(league_api_id),
        }

    def _get_matches_endpoint(self) -> str:
        return "/games"

    def _get_matches_params(self, league_api_id: int, date: str) -> dict:
        return {
            "league": league_api_id,
            "season": self._get_season_string(league_api_id),
            "date": date,
        }

    def _get_live_matches_endpoint(self) -> str:
        return "/games?live=all"

    def _get_matches_by_ids_endpoints(self, ids: list[int]) -> list[str]:
        # API-Basketball v1 DOES NOT support batching via 'ids'!
        # We must return one endpoint per ID for parallel fetching.
        return [f"/games?id={match_id}" for match_id in ids]

    def _get_analytics_matches_table(self) -> str:
        return "basketball_matches"

    # =========================================================================
    # TRANSFORMATIONS
    # =========================================================================
    def _transform_league(self, raw: dict, meta: dict) -> dict:
        """
        API-Basketball /leagues response → analytics.leagues row.
        raw = {"id": ..., "name": ..., "type": ..., "country": {...}, "seasons": [...]}
        """
        seasons = raw.get("seasons", [])
        current_season = None
        for s in seasons:
            season_str = str(s.get("season", ""))
            if str(CURRENT_SEASON) in season_str:
                current_season = s
                break
        if not current_season and seasons:
            current_season = seasons[-1]

        return {
            "api_id": raw.get("id"),
            "sport": self.sport,
            "name": meta.get("name", raw.get("name", "")),
            "country": meta.get("country", ""),
            "tier": meta.get("tier", "major"),
            "season_start": current_season.get("start") if current_season else None,
            "season_end": current_season.get("end") if current_season else None,
        }

    def _transform_team(self, raw: dict, internal_league_id: int) -> dict:
        """
        API-Basketball /teams response → analytics.teams row.
        raw = {"id": ..., "name": ..., "logo": ..., ...}
        """
        return {
            "api_id": raw.get("id"),
            "sport": self.sport,
            "name": raw.get("name", ""),
            "short_name": self._generate_short_name(raw.get("name", "")),
            "logo_url": raw.get("logo", ""),
            "league_id": internal_league_id,
            "stadium_city": "",
            "stadium_lat": None,
            "stadium_lon": None,
        }

    def _transform_match(self, raw: dict) -> Optional[dict]:
        """
        API-Basketball /games response → analytics.basketball_matches row.
        raw = {"id": ..., "date": ..., "teams": {...}, "scores": {...}, "status": {...}, ...}
        """
        game_id = raw.get("id")
        if not game_id:
            return None

        teams = raw.get("teams", {})
        scores = raw.get("scores", {})
        status_info = raw.get("status", {})
        league = raw.get("league", {})

        home_api_id = teams.get("home", {}).get("id")
        away_api_id = teams.get("away", {}).get("id")
        league_api_id = league.get("id")

        home_team_id = self._team_id_map.get(home_api_id)
        away_team_id = self._team_id_map.get(away_api_id)
        internal_league_id = self._league_id_map.get(league_api_id)

        if not home_team_id or not away_team_id or not internal_league_id:
            logger.warning(
                f"[basketball] Skipping game {game_id}: "
                f"unresolved IDs (home={home_api_id}, away={away_api_id}, league={league_api_id})"
            )
            return None

        api_status = status_info.get("short", "NS")
        status = self.status_map.get(api_status, "scheduled")

        home_scores = scores.get("home", {})
        away_scores = scores.get("away", {})

        def _quarter_score(key: str) -> Optional[dict]:
            h = home_scores.get(key)
            a = away_scores.get(key)
            if h is not None and a is not None:
                return {"home": h, "away": a}
            return None

        # Basketball API: venue info may be in "arena" or "venue" field
        arena_name = None
        if raw.get("arena"):
            arena_name = raw["arena"].get("name")
        elif raw.get("venue"):
            arena_name = raw["venue"].get("name") if isinstance(raw["venue"], dict) else raw["venue"]

        return {
            "api_id": game_id,
            "league_id": internal_league_id,
            "date_time": raw.get("date"),
            "home_team_id": home_team_id,
            "away_team_id": away_team_id,
            "home_score": home_scores.get("total"),
            "away_score": away_scores.get("total"),
            "score_q1": _quarter_score("quarter_1"),
            "score_q2": _quarter_score("quarter_2"),
            "score_q3": _quarter_score("quarter_3"),
            "score_q4": _quarter_score("quarter_4"),
            "score_ot": _quarter_score("over_time"),
            "status": status,
            "stadium": arena_name,
        }

    def _build_public_match(self, analytics_row: dict) -> Optional[dict]:
        """
        Construit un objet public.matches depuis une ligne analytics.basketball_matches.
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
            quarters = {}
            for q in ["score_q1", "score_q2", "score_q3", "score_q4", "score_ot"]:
                if analytics_row.get(q):
                    quarters[q] = analytics_row[q]
            if quarters:
                score_obj["details"] = quarters

        meta = {}
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

    @staticmethod
    def _generate_short_name(full_name: str) -> str:
        """
        Generate a 3-letter code from team name.
        "Los Angeles Lakers" → "LAL", "Boston Celtics" → "BOS"
        """
        words = full_name.split()
        if len(words) >= 3:
            return (words[0][0] + words[1][0] + words[2][0]).upper()
        elif len(words) == 2:
            return (words[0][0] + words[1][:2]).upper()
        elif len(words) == 1:
            return words[0][:3].upper()
        return "UNK"
