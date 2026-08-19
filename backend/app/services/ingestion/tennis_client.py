"""
BETIX — TennisClient
Concrete implementation of BaseSportClient for Tennis (api-tennis.com).
Handles sport-specific transforms: fixtures, players, tournaments.

Key differences from Football/Basketball:
- Different API (api-tennis.com) with the key passed in query params.
- Uses players instead of teams.
- Uses tournaments (tennis_tournaments) instead of leagues.
- The response format uses "result" instead of "response".
"""

import logging
from typing import Optional

import httpx

from app.config import get_settings
from .base_client import BaseSportClient
from .constants import ANALYTICS_TO_PUBLIC_STATUS

logger = logging.getLogger("betix.ingestion.tennis")

# API-Tennis statuses → DB statuses
TENNIS_STATUS_MAP = {
    "Finished": "finished",
    "Not Started": "scheduled",
    # Decided (winner declared or match permanently cancelled)
    "Cancelled": "cancelled",
    "Walkover": "finished",
    "Retired": "finished",
    "Abandoned": "finished",
    "Defaulted": "finished",
    # Postponed (match will be replayed)
    "Postponed": "postponed",
    "Delayed": "postponed",
    "Suspended": "postponed",
    "Interrupted": "postponed",
    "Live": "live",
}

# No classic "league_ids" for tennis — we scan by date instead.
TENNIS_LEAGUES = {}


class TennisClient(BaseSportClient):
    """Ingestion client for Tennis via api-tennis.com."""

    sport = "tennis"
    base_url = ""  # Overridden in __init__
    league_ids = TENNIS_LEAGUES
    status_map = TENNIS_STATUS_MAP

    def __init__(self) -> None:
        settings = get_settings()
        self.api_key = settings.API_TENNIS_KEY
        self.tennis_base_url = settings.API_TENNIS_BASE_URL

        # REST client for the analytics.* schema
        from .base_client import SupabaseREST
        self.analytics = SupabaseREST(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY,
            schema="analytics",
        )

        # REST client for the public.* schema
        self.public = SupabaseREST(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY,
            schema="public",
        )

        # HTTP client for api-tennis.com (no auth header, key passed in query params)
        self.http = httpx.AsyncClient(
            base_url=self.tennis_base_url,
        )

        # Internal caches — for tennis these are players and tournaments
        self._league_id_map: dict[int, int] = {}    # tournament api_id -> internal db id
        self._team_id_map: dict[int, int] = {}       # player api_id -> internal db id
        self._tournament_surface: dict[int, str] = {}  # tournament api_id -> surface
        self._request_count = 0

    # =========================================================================
    # API CALL — Override for api-tennis (key passed in query params)
    # =========================================================================
    async def _api_get(self, endpoint: str, params: dict | None = None) -> dict:
        """
        GET call to api-tennis.com.
        The API key is injected into the query params.
        """
        if self._request_count >= 7000:
            msg = f"[tennis] Quota guard: {self._request_count} requests used, stopping."
            logger.warning(msg)
            raise RuntimeError(msg)

        if params is None:
            params = {}
        params["APIkey"] = self.api_key

        try:
            resp = await self.http.get(endpoint, params=params)
            self._request_count += 1
            resp.raise_for_status()
            data = resp.json()

            if not data.get("success"):
                logger.error(f"[tennis] API error on {endpoint}: {data}")
                return {"result": []}

            return data

        except httpx.TimeoutException:
            logger.error(f"[tennis] Timeout on {endpoint}")
            return {"result": []}

        except httpx.HTTPStatusError as e:
            logger.error(f"[tennis] HTTP {e.response.status_code} on {endpoint}")
            return {"result": []}

    # =========================================================================
    # CACHES — players and tournaments instead of teams and leagues
    # =========================================================================
    def _load_league_id_map(self) -> None:
        """Loads the api_id -> id mapping for tennis tournaments."""
        rows = self.analytics.select("tennis_tournaments", "id,api_id,surface", {})
        self._league_id_map = {r["api_id"]: r["id"] for r in rows if r.get("api_id")}
        self._tournament_surface = {r["api_id"]: r.get("surface") for r in rows if r.get("api_id")}

    def _load_team_id_map(self) -> None:
        """Loads the api_id -> id mapping for players."""
        rows = self.analytics.select("players", "id,api_id", {})
        self._team_id_map = {r["api_id"]: r["id"] for r in rows if r.get("api_id")}

    # =========================================================================
    # ENDPOINTS
    # =========================================================================
    def _get_leagues_endpoint(self) -> str:
        return ""  # Not used for tennis

    def _get_teams_endpoint(self) -> str:
        return ""  # Not used for tennis

    def _get_teams_params(self, league_api_id: int) -> dict:
        return {}  # Not used for tennis

    def _get_matches_endpoint(self) -> str:
        return ""  # api-tennis uses root endpoint with method param

    def _get_matches_params(self, league_api_id: int, date: str) -> dict:
        return {"method": "get_fixtures", "date_start": date, "date_stop": date}

    def _get_live_matches_endpoint(self) -> str:
        return ""  # Not used currently

    def _get_matches_by_ids_endpoints(self, ids: list[int]) -> list[str]:
        # api-tennis doesn't support batch — one endpoint per ID
        return [f"?method=get_fixtures&event_id={mid}" for mid in ids]

    def _get_analytics_matches_table(self) -> str:
        return "tennis_matches"

    # =========================================================================
    # TRANSFORMATIONS
    # =========================================================================
    def _transform_league(self, raw: dict, meta: dict) -> dict:
        """Not used for tennis (tournaments handled separately)."""
        return {}

    def _transform_team(self, raw: dict, internal_league_id: int) -> dict:
        """Not used for tennis (players handled separately)."""
        return {}

    def _transform_match(self, raw: dict) -> Optional[dict]:
        """
        api-tennis fixture → analytics.tennis_matches row.
        Unified robust logic (similar to TennisMatchUpserter).
        """
        api_id = raw.get("event_key")
        if not api_id:
            return None

        api_id = int(api_id)

        # 1. Resolve Player & Tournament IDs
        p1_api = raw.get("first_player_key")
        p2_api = raw.get("second_player_key")
        t_api = raw.get("tournament_key")

        if not p1_api or not p2_api or not t_api:
            return None

        p1_api, p2_api, t_api = int(p1_api), int(p2_api), int(t_api)
        p1_id = self._team_id_map.get(p1_api)
        p2_id = self._team_id_map.get(p2_api)
        t_id = self._league_id_map.get(t_api)

        if not p1_id or not p2_id or not t_id:
            logger.debug(f"[tennis] Skipping match {api_id}: Unresolved IDs (p1={p1_api}, p2={p2_api}, t={t_api})")
            return None

        # 2. Date & Time Parsing
        event_date = raw.get("event_date", "")
        event_time = raw.get("event_time", "")
        date_time = None
        if event_date and event_time and event_time != "":
            date_time = f"{event_date}T{event_time}:00Z"

        # 3. Status Mapping (Robust Logic)
        raw_status = raw.get("event_status", "")
        # API-Tennis sometimes returns numeric codes ("1"=Not Started, "3"=Finished, etc.)
        NUMERIC_STATUS_MAP = {"1": "Not Started", "2": "Live", "3": "Finished", "4": "Postponed",
                              "5": "Cancelled", "6": "Postponed", "7": "Cancelled", "8": "Walkover", "0": "Not Started"}
        if raw_status in NUMERIC_STATUS_MAP:
            raw_status = NUMERIC_STATUS_MAP[raw_status]
        is_live = str(raw.get("event_live", "0")) == "1"
        winner_raw = raw.get("event_winner")
        final_res = raw.get("event_final_result", "")

        status = self.status_map.get(raw_status, "scheduled")

        # Absolute end-of-match rule
        if raw_status == "Finished" or (winner_raw and final_res and final_res != "-"):
            status = "finished"
        elif "Set" in raw_status or "Tiebreak" in raw_status or "Game" in raw_status or raw_status == "Live" or is_live:
            status = "live"
            
        # 4. Winner ID
        winner_id = None
        if winner_raw == "First Player":
            winner_id = p1_id
        elif winner_raw == "Second Player":
            winner_id = p2_id

        # 5. Score & Sets Played
        score = final_res if final_res and final_res != "-" else None
        
        sets_played = 0
        raw_scores = raw.get("scores", [])
        if isinstance(raw_scores, list) and len(raw_scores) > 0:
            # Ignore API-Tennis' phantom "0-0" set
            first_set = raw_scores[0]
            if first_set.get("score_first") == "0" and first_set.get("score_second") == "0" and len(raw_scores) == 1:
                sets_played = 0
            else:
                sets_played = len(raw_scores)

        surface = self._tournament_surface.get(t_api)

        return {
            "api_id": api_id,
            "tournament_id": t_id,
            "round": raw.get("tournament_round") or None,
            "date_time": date_time,
            "player1_id": p1_id,
            "player2_id": p2_id,
            "winner_id": winner_id,
            "score": score,
            "duration_minutes": None,
            "sets_played": sets_played,
            "status": status,
            "surface": surface,
            "indoor_outdoor": None,
            "venue": None,
        }

    def _build_public_match(self, analytics_row: dict) -> Optional[dict]:
        """
        Builds a public.matches object from an analytics.tennis_matches row.
        """
        # Lookup player info
        p1_info = self._get_player_info(analytics_row.get("player1_id"))
        p2_info = self._get_player_info(analytics_row.get("player2_id"))
        tournament_info = self._get_tournament_info(analytics_row.get("tournament_id"))

        if not p1_info or not p2_info:
            return None

        analytics_status = analytics_row.get("status", "scheduled")
        public_status = ANALYTICS_TO_PUBLIC_STATUS.get(analytics_status, "upcoming")

        meta = {}
        if analytics_row.get("round"):
            tournament_name = tournament_info.get("name", "") if tournament_info else ""
            meta["round"] = f"{tournament_name} - {analytics_row['round']}" if tournament_name else analytics_row["round"]

        return {
            "api_sport_id": str(analytics_row["api_id"]),
            "sport": self.sport,
            "league_name": tournament_info.get("name", "") if tournament_info else "",
            "home_team": {
                "id": analytics_row.get("player1_id"),
                "name": p1_info.get("name", ""),
                "logo": None,
            },
            "away_team": {
                "id": analytics_row.get("player2_id"),
                "name": p2_info.get("name", ""),
                "logo": None,
            },
            "date_time": analytics_row.get("date_time"),
            "status": public_status,
            "score": {
                "home": None,
                "away": None,
                "display": analytics_row.get("score"),
                "sets_played": analytics_row.get("sets_played"),
            },
            "tournament_meta": meta if meta else None,
        }

    # =========================================================================
    # HELPERS — Player & Tournament info lookup
    # =========================================================================
    def _get_player_info(self, internal_id: int | None) -> Optional[dict]:
        """Fetch player info by internal DB id."""
        if not internal_id:
            return None
        rows = self.analytics.select("players", "name", {"id": internal_id}, limit=1)
        return rows[0] if rows else None

    def _get_tournament_info(self, internal_id: int | None) -> Optional[dict]:
        """Fetch tournament info by internal DB id."""
        if not internal_id:
            return None
        rows = self.analytics.select("tennis_tournaments", "name", {"id": internal_id}, limit=1)
        return rows[0] if rows else None
