"""
BETIX — BaseSportClient
Abstract base class for sports data ingestion.
Provides the shared methods: API calls, UPSERT, logging, sync to public.
Each sport (Football, Basketball) subclasses this and implements its own transforms.

NOTE: Uses raw httpx + Supabase PostgREST API instead of the supabase-py SDK
to avoid the SDK's blocking Realtime WebSocket connection during batch jobs.
"""

import asyncio
import json
import logging
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from app.config import get_settings
from .constants import ANALYTICS_TO_PUBLIC_STATUS, CURRENT_SEASON

logger = logging.getLogger("betix.ingestion")


class SupabaseREST:
    """
    Lightweight Supabase PostgREST client using httpx.
    Supports schema selection via Accept-Profile / Content-Profile headers.
    """

    def __init__(self, url: str, service_role_key: str, schema: str = "public") -> None:
        self.base_url = f"{url}/rest/v1"
        self.schema = schema
        self.headers = {
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Accept-Profile": schema,
            "Content-Profile": schema,
            "Prefer": "return=representation",
        }

    def upsert(self, table: str, data: list[dict], on_conflict: str) -> list[dict]:
        """UPSERT rows into a table. Returns upserted rows."""
        if not data:
            return []
        headers = {
            **self.headers,
            "Prefer": f"return=representation,resolution=merge-duplicates",
        }
        url = f"{self.base_url}/{table}?on_conflict={on_conflict}"
        resp = httpx.post(url, headers=headers, json=data, timeout=30.0)
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            print(f"DEBUG: Supabase UPSERT Error Body: {e.response.text}")
            logger.error(f"Supabase UPSERT Error: {e.response.text}")
            raise

        return resp.json()

    def insert(self, table: str, data: dict) -> dict:
        """INSERT a single row. Returns the inserted row."""
        headers = {**self.headers, "Prefer": "return=representation"}
        url = f"{self.base_url}/{table}"
        resp = httpx.post(url, headers=headers, json=data, timeout=15.0)
        resp.raise_for_status()
        result = resp.json()
        return result[0] if result else {}

    def update(self, table: str, data: dict, filters: dict[str, Any]) -> list[dict]:
        """UPDATE rows. Returns the updated rows."""
        headers = {**self.headers, "Prefer": "return=representation"}
        url = f"{self.base_url}/{table}?"
        if filters:
            for col, val in filters.items():
                url += f"{col}=eq.{val}&"
        url = url.rstrip("&")
        
        resp = httpx.patch(url, headers=headers, json=data, timeout=15.0)
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            logger.error(f"Supabase UPDATE Error: {e.response.text}")
            raise
        return resp.json()

    def select(
        self, 
        table: str, 
        columns: str = "*", 
        filters: dict[str, Any] | None = None, 
        limit: int | None = None,
        order: str | None = None
    ) -> list[dict]:
        """SELECT rows from a table with optional filters and ordering."""
        url = f"{self.base_url}/{table}"
        params = {"select": columns}

        if filters:
            for col, val in filters.items():
                # Support for (operator, value) tuples, e.g., ("lte", "2024-01-01")
                if isinstance(val, tuple) and len(val) == 2:
                    op, v = val
                    params[col] = f"{op}.{v}"
                else:
                    params[col] = f"eq.{val}"
        
        if order:
            params["order"] = order
        if limit:
            # PostgREST expects limit as a query param, not a header
            params["limit"] = str(limit)
            
        # httpx handles encoding of params automatically
        resp = httpx.get(url, headers=self.headers, params=params, timeout=15.0)
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            logger.error(f"Supabase SELECT Error for {table}: {e.response.text} | Params: {params}")
            raise
        return resp.json()

    def select_raw(self, table: str, query_params: str) -> list[dict]:
        """SELECT rows using a raw PostgREST query string."""
        url = f"{self.base_url}/{table}?{query_params}"
        resp = httpx.get(url, headers=self.headers, timeout=15.0)
        resp.raise_for_status()
        return resp.json()

    def delete(self, table: str, filters: dict[str, Any]) -> None:
        """DELETE rows based on filters."""
        url = f"{self.base_url}/{table}?"
        if filters:
            for col, val in filters.items():
                # postgrest format: col=eq.val or col=gt.val
                # if val contains ".", assume operator is included (e.g. "gt.0")
                if "." in str(val):
                     url += f"{col}={val}&"
                else:
                     url += f"{col}=eq.{val}&"
        url = url.rstrip("&")
        
        resp = httpx.delete(url, headers=self.headers, timeout=15.0)
        resp.raise_for_status()


class BaseSportClient(ABC):
    """
    Abstract ingestion client.
    Each sport must implement the _transform_* methods and _build_public_match.
    """

    # --- Abstract attributes to define in subclasses ---
    sport: str = ""
    base_url: str = ""
    league_ids: dict[int, dict] = {}
    status_map: dict[str, str] = {}

    def __init__(self) -> None:
        settings = get_settings()
        self.api_key = settings.API_SPORTS_KEY

        # REST client for the analytics.* schema
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

        # HTTP client for API-Sports calls
        self.http = httpx.AsyncClient(
            base_url=f"https://{self.base_url}",
            headers={"x-apisports-key": self.api_key},
        )

        # Internal cache for api_id -> internal_id mappings
        self._league_id_map: dict[int, int] = {}  # api_id -> internal db id
        self._team_id_map: dict[int, int] = {}  # api_id -> internal db id
        self._request_count = 0

    # =========================================================================
    # API CALL (with rate-limit guard)
    # =========================================================================
    async def _api_get(self, endpoint: str, params: dict | None = None) -> dict:
        """
        GET call to API-Sports with request-counter tracking.
        Raises an exception if the quota is nearly exhausted.
        """
        if self._request_count >= 7000:
            msg = f"[{self.sport}] Quota guard: {self._request_count} requests used, stopping (Pro limit: 7500/day)."
            logger.warning(msg)
            self._log("warning", msg)
            raise RuntimeError(msg)

        try:
            resp = await self.http.get(endpoint, params=params)
            self._request_count += 1
            resp.raise_for_status()
            data = resp.json()

            # API-Sports wraps errors in the response body
            if data.get("errors") and len(data["errors"]) > 0:
                error_detail = str(data["errors"])
                logger.error(f"[{self.sport}] API error on {endpoint}: {error_detail}")
                self._log("error", f"API error on {endpoint}: {error_detail}")
                return {"response": []}

            return data

        except httpx.TimeoutException:
            msg = f"[{self.sport}] Timeout on {endpoint}"
            logger.error(msg)
            self._log("error", msg)
            return {"response": []}

        except httpx.HTTPStatusError as e:
            msg = f"[{self.sport}] HTTP {e.response.status_code} on {endpoint}: {e.response.text}"
            logger.error(msg)
            self._log("error", msg)
            return {"response": []}

    # =========================================================================
    # LOGGING
    # =========================================================================
    def _log(self, level: str, message: str) -> None:
        """Insert a log entry into public.system_logs."""
        try:
            self.public.insert("system_logs", {
                "level": level,
                "source": f"ingestion-{self.sport}",
                "message": message,
            })
        except Exception as e:
            logger.error(f"Failed to write system_log: {e}")

    # =========================================================================
    # ID CACHES (api_id -> internal_id)
    # =========================================================================
    def _load_league_id_map(self) -> None:
        """
        Loads the api_id -> id mapping for this sport's leagues.
        Call AFTER league ingestion.
        """
        rows = self.analytics.select("leagues", "id,api_id", {"sport": self.sport})
        self._league_id_map = {r["api_id"]: r["id"] for r in rows}

    def _load_team_id_map(self) -> None:
        """
        Loads the api_id -> id mapping for this sport's teams.
        Call AFTER team ingestion.
        """
        rows = self.analytics.select("teams", "id,api_id", {"sport": self.sport})
        self._team_id_map = {r["api_id"]: r["id"] for r in rows}

    # =========================================================================
    # INGESTION: LEAGUES
    # =========================================================================
    async def ingest_leagues(self) -> int:
        """
        Ingests the target leagues into analytics.leagues.
        Returns the number of leagues inserted/updated.
        """
        logger.info(f"[{self.sport}] Ingesting {len(self.league_ids)} leagues...")

        if not self._team_id_map: self._load_team_id_map()
        if not self._league_id_map: self._load_league_id_map()

        rows = []
        for api_id, meta in self.league_ids.items():
            data = await self._api_get(self._get_leagues_endpoint(), {"id": api_id})
            items = data.get("response", [])
            if items:
                transformed = self._transform_league(items[0], meta)
                rows.append(transformed)
            await asyncio.sleep(0.5)  # Rate limit courtesy

        if rows:
            self.analytics.upsert("leagues", rows, "api_id,sport")

        self._load_league_id_map()

        msg = f"[{self.sport}] Leagues: {len(rows)} upserted."
        logger.info(msg)
        self._log("info", msg)
        return len(rows)

    # =========================================================================
    # INGESTION: TEAMS
    # =========================================================================
    async def ingest_teams(self) -> int:
        """
        Ingests teams for all target leagues into analytics.teams.
        Returns the number of teams inserted/updated.
        """
        if not self._league_id_map:
            self._load_league_id_map()

        all_rows: list[dict] = []

        for api_league_id, internal_league_id in self._league_id_map.items():
            logger.info(f"[{self.sport}] Fetching teams for league api_id={api_league_id}...")
            params = self._get_teams_params(api_league_id)
            data = await self._api_get(self._get_teams_endpoint(), params)
            items = data.get("response", [])
            for item in items:
                transformed = self._transform_team(item, internal_league_id)
                all_rows.append(transformed)

            await asyncio.sleep(1.0)  # Rate limit

        if all_rows:
            # Batch upsert to avoid 500/timeout issues
            batch_size = 50
            for i in range(0, len(all_rows), batch_size):
                batch = all_rows[i:i+batch_size]
                self.analytics.upsert("teams", batch, "api_id,sport")
                logger.debug(f"[{self.sport}] Batched upsert: {i+len(batch)}/{len(all_rows)}")

        self._load_team_id_map()

        msg = f"[{self.sport}] Teams: {len(all_rows)} upserted."
        logger.info(msg)
        self._log("info", msg)
        return len(all_rows)

    # =========================================================================
    # INGESTION: MATCHES
    # =========================================================================
    async def ingest_matches(self, date: str) -> int:
        """
        Ingests matches for a given date into the sport-specific analytics table.
        Then syncs to public.matches.
        Args:
            date: Format "YYYY-MM-DD"
        Returns:
            Number of matches inserted/updated.
        """
        if not self._team_id_map:
            self._load_team_id_map()
        if not self._league_id_map:
            self._load_league_id_map()

        all_analytics_rows: list[dict] = []
        all_public_rows: list[dict] = []

        for api_league_id in self.league_ids.keys():
            logger.info(
                f"[{self.sport}] Fetching matches for league {api_league_id} on {date}..."
            )
            data = await self._api_get(
                self._get_matches_endpoint(),
                self._get_matches_params(api_league_id, date),
            )
            items = data.get("response", [])

            for item in items:
                analytics_row = self._transform_match(item)
                if analytics_row:
                    all_analytics_rows.append(analytics_row)

            await asyncio.sleep(1.0)

        # UPSERT into analytics table
        if all_analytics_rows:
            self.analytics.upsert(
                self._get_analytics_matches_table(),
                all_analytics_rows,
                "api_id",
            )

            # Build public.matches from the analytics rows
            for row in all_analytics_rows:
                public_row = self._build_public_match(row)
                if public_row:
                    all_public_rows.append(public_row)

        # UPSERT into public.matches
        if all_public_rows:
            self.public.upsert("matches", all_public_rows, "api_sport_id,sport")

        msg = (
            f"[{self.sport}] Matches on {date}: "
            f"{len(all_analytics_rows)} analytics, {len(all_public_rows)} public."
        )
        logger.info(msg)
        self._log("info", msg)
        return len(all_analytics_rows)

    # =========================================================================
    def _get_live_match_api_ids_from_db(self) -> list[int]:
        """
        Fetches the API IDs of matches that are 'live'
        by querying the sport's own analytics table (source of truth).
        """
        table = self._get_analytics_matches_table()
        query = "select=api_id&status=eq.live"
        
        print(f"DEBUG: [{self.sport}] Searching IDs in {table} with query: {query}")
        
        try:
            # Query within the analytics schema
            rows = self.analytics.select_raw(table, query)
            ids = [int(r["api_id"]) for r in rows if r.get("api_id")]
            print(f"DEBUG: [{self.sport}] Found IDs: {ids}")
            return ids
        except Exception as e:
            logger.error(f"[{self.sport}] Failed to get live match IDs from analytics DB: {e}")
            print(f"DEBUG: [{self.sport}] ERROR: {e}")
            return []

    async def ingest_live_matches(self) -> int:
        """
        Ingests only LIVE matches (or those expected to be) based on the DB.
        Updates analytics.*_matches and public.matches.
        """
        if not self._team_id_map:
            self._load_team_id_map()
        if not self._league_id_map:
            self._load_league_id_map()

        # 1. Get relevant match IDs from DB
        target_ids = self._get_live_match_api_ids_from_db()
        
        if not target_ids:
            logger.info(f"[{self.sport}] No live/pending matches found in DB to refresh.")
            return 0

        logger.info(f"[{self.sport}] Refreshing {len(target_ids)} matches from API...")
        
        # 2. Parallel calls to API (using the new endpoints interface)
        endpoints = self._get_matches_by_ids_endpoints(target_ids)
        all_analytics_rows: list[dict] = []
        all_public_rows: list[dict] = []

        async def _fetch_batch(endpoint):
            try:
                data = await self._api_get(endpoint)
                items = data.get("response", [])
                batch_rows = []
                for item in items:
                    analytics_row = self._transform_match(item)
                    if analytics_row:
                        batch_rows.append(analytics_row)
                    else:
                        fixture_id = item.get("fixture", {}).get("id") or item.get("id")
                        logger.debug(f"[{self.sport}] Refresh: match {fixture_id} skipped by transform.")
                return batch_rows
            except Exception as e:
                logger.error(f"[{self.sport}] Error refreshing endpoint {endpoint}: {e}")
                return []

        # Execute all fetches in parallel
        results = await asyncio.gather(*[_fetch_batch(ep) for ep in endpoints])
        for res in results:
            all_analytics_rows.extend(res)

        # 3. Upsert Results
        if all_analytics_rows:
            # UPSERT analytics
            self.analytics.upsert(
                self._get_analytics_matches_table(),
                all_analytics_rows,
                "api_id",
            )
            # UPSERT public
            for row in all_analytics_rows:
                public_row = self._build_public_match(row)
                if public_row:
                    all_public_rows.append(public_row)

            if all_public_rows:
                self.public.upsert("matches", all_public_rows, "api_sport_id,sport")

        msg = f"[{self.sport}] Live Refresh: {len(all_public_rows)} matches updated (Targeted: {len(target_ids)})."
        logger.info(msg)
        self._log("info", msg)
        return len(all_public_rows)

    # =========================================================================
    # ABSTRACT METHODS — To be implemented by each sport
    # =========================================================================
    async def fetch_live_data_only(self) -> list[dict]:
        """
        [DEBUG] Fetches and transforms live data from the API without persisting to the DB.
        Useful for checking scores/status before enabling writes.
        """
        if not self._team_id_map:
            self._load_team_id_map()
        if not self._league_id_map:
            self._load_league_id_map()

        target_ids = self._get_live_match_api_ids_from_db()
        if not target_ids:
            return []

        all_transformed: list[dict] = []
        batch_size = 20

        # Prepare the API calls. Some sports support batching (Football),
        # others don't (Basketball v1).
        endpoints: list[str] = self._get_matches_by_ids_endpoints(target_ids)
        
        async def _fetch_one(endpoint):
            try:
                data = await self._api_get(endpoint)
                items = data.get("response", [])
                transformed = []
                for item in items:
                    analytics_row = self._transform_match(item)
                    if analytics_row:
                        transformed.append({
                            "api_id": analytics_row.get("api_id"),
                            "status": analytics_row.get("status"),
                            "score": analytics_row.get("score") or {
                                "home": analytics_row.get("home_score"),
                                "away": analytics_row.get("away_score")
                            },
                            "teams": {
                                "home": analytics_row.get("home_team_name") or "Team A",
                                "away": analytics_row.get("away_team_name") or "Team B"
                            }
                        })
                return transformed
            except Exception as e:
                logger.error(f"[{self.sport}] Error fetching {endpoint}: {e}")
                return []

        # Fire all calls in parallel (bounded by the quota)
        results = await asyncio.gather(*[_fetch_one(ep) for ep in endpoints])
        for res in results:
            all_transformed.extend(res)

        return all_transformed

    def _get_matches_by_ids_endpoints(self, ids: list[int]) -> list[str]:
        """
        Generates a list of endpoints for fetching matches by IDs.
        Attempts to batch by default (recommended).
        """
        ids_str = "-".join(map(str, ids))
        return [f"{self._get_matches_endpoint()}?ids={ids_str}"]

    def _get_leagues_endpoint(self) -> str:
        """API endpoint for fetching leagues."""
        ...

    @abstractmethod
    def _get_teams_endpoint(self) -> str:
        """API endpoint for fetching teams."""
        return "/teams"

    @abstractmethod
    def _get_teams_params(self, league_api_id: int) -> dict:
        """Parameters for the team-fetching request."""
        ...

    @abstractmethod
    def _get_matches_endpoint(self) -> str:
        """API endpoint for fetching matches."""
        ...

    @abstractmethod
    def _get_matches_params(self, league_api_id: int, date: str) -> dict:
        """Parameters for the matches request."""
        ...

    @abstractmethod
    def _get_live_matches_endpoint(self) -> str:
        """API endpoint for fetching live matches."""
        ...

    @abstractmethod
    def _get_analytics_matches_table(self) -> str:
        """Name of the analytics table for this sport's matches."""
        ...

    @abstractmethod
    def _transform_league(self, raw: dict, meta: dict) -> dict:
        """Transforms the API response into an analytics.leagues row."""
        ...

    @abstractmethod
    def _transform_team(self, raw: dict, internal_league_id: int) -> dict:
        """Transforms the API response into an analytics.teams row."""
        ...

    @abstractmethod
    def _transform_match(self, raw: dict) -> Optional[dict]:
        """Transforms the API response into an analytics.*_matches row."""
        ...

    @abstractmethod
    def _build_public_match(self, analytics_row: dict) -> Optional[dict]:
        """
        Builds a public.matches object from an analytics row.
        Resolves FKs using the _team_id_map and _league_id_map caches.
        """
        ...

    # =========================================================================
    # CLEANUP
    # =========================================================================
    async def close(self) -> None:
        """Closes the HTTP client."""
        await self.http.aclose()
