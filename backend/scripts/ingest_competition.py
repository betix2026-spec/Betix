"""
BETIX — ingest_competition.py
Mega script reutilisable pour ingerer une competition complete :
equipes, matchs, historique, stats, H2H, rolling L5, ELO, sync public.

Usage (Coupe du Monde 2026) :
    cd backend
    python scripts/ingest_competition.py \
        --league-id 1 --season 2026 \
        --qualifier-leagues 363,361,360,359,358,364,365 \
        --history-seasons 2022,2023,2024,2025,2026

    python scripts/ingest_competition.py --league-id 1 --season 2026 --dry-run
"""

import argparse
import asyncio
import json
import logging
import sys
import os
import time
from collections import defaultdict

import httpx

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST
from app.services.ingestion.constants import FOOTBALL_STATUS_MAP, ANALYTICS_TO_PUBLIC_STATUS

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s — %(message)s")
logger = logging.getLogger("betix.ingest_competition")


class QuotaExceededError(Exception):
    pass


class CompetitionIngester:

    def __init__(
        self,
        league_id: int,
        season: int,
        qualifier_league_ids: list[int] | None = None,
        history_seasons: list[int] | None = None,
        dry_run: bool = False,
        max_api_calls: int = 7000,
    ):
        self.league_id = league_id
        self.season = season
        self.qualifier_league_ids = qualifier_league_ids or []
        self.history_seasons = history_seasons or []
        self.dry_run = dry_run
        self.max_api_calls = max_api_calls

        settings = get_settings()
        self.api_key = settings.API_SPORTS_KEY
        self.analytics = SupabaseREST(
            settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="analytics"
        )
        self.public = SupabaseREST(
            settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="public"
        )
        self.http = httpx.AsyncClient(
            base_url="https://v3.football.api-sports.io",
            headers={"x-apisports-key": self.api_key},
            timeout=15.0,
        )

        self._league_id_map: dict[int, int] = {}
        self._team_id_map: dict[int, int] = {}
        self._team_id_reverse: dict[int, int] = {}  # internal_id -> api_id
        self._competition_team_api_ids: set[int] = set()
        self._api_call_count = 0

        self.report = {
            "league": {"upserted": 0},
            "teams": {"upserted": 0},
            "fixtures": {"upserted": 0},
            "history": {"matches": 0, "new_leagues": 0, "new_teams": 0, "errors": []},
            "stats": {"processed": 0, "skipped": 0, "errors": []},
            "h2h": {"pairs": 0, "errors": []},
            "rolling": {"rows": 0},
            "elo": {"snapshots": 0},
            "public_sync": {"upserted": 0},
            "api_calls_total": 0,
            "duration_seconds": 0,
        }

    # =========================================================================
    # API
    # =========================================================================

    async def _api_get(self, endpoint: str, params: dict | None = None) -> dict:
        if self._api_call_count >= self.max_api_calls:
            raise QuotaExceededError(
                f"Quota API atteint ({self._api_call_count}/{self.max_api_calls})"
            )
        self._api_call_count += 1
        try:
            resp = await self.http.get(endpoint, params=params)
            resp.raise_for_status()
            data = resp.json()
            errors = data.get("errors")
            if errors and (isinstance(errors, dict) and errors or isinstance(errors, list) and errors):
                logger.warning(f"API errors: {errors}")
            return data
        except httpx.TimeoutException:
            logger.error(f"Timeout: {endpoint} {params}")
            return {"response": []}
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP {e.response.status_code}: {endpoint}")
            return {"response": []}

    # =========================================================================
    # CACHES
    # =========================================================================

    def _load_league_id_map(self):
        rows = self.analytics.select("leagues", "id,api_id", {"sport": "football"})
        self._league_id_map = {r["api_id"]: r["id"] for r in rows}
        logger.info(f"  Cache leagues: {len(self._league_id_map)} entrees")

    def _load_team_id_map(self):
        rows = self.analytics.select("teams", "id,api_id", {"sport": "football"})
        self._team_id_map = {r["api_id"]: r["id"] for r in rows}
        self._team_id_reverse = {r["id"]: r["api_id"] for r in rows}
        logger.info(f"  Cache teams: {len(self._team_id_map)} entrees")

    # =========================================================================
    # TRANSFORM (meme logique que FootballClient)
    # =========================================================================

    def _transform_match(self, raw: dict) -> dict | None:
        fixture = raw.get("fixture", {})
        league = raw.get("league", {})
        teams = raw.get("teams", {})
        goals = raw.get("goals", {})

        api_id = fixture.get("id")
        if not api_id:
            return None

        home_api_id = teams.get("home", {}).get("id")
        away_api_id = teams.get("away", {}).get("id")
        league_api_id = league.get("id")

        home_team_id = self._team_id_map.get(home_api_id)
        away_team_id = self._team_id_map.get(away_api_id)
        internal_league_id = self._league_id_map.get(league_api_id)

        if not home_team_id or not away_team_id or not internal_league_id:
            return None

        api_status = fixture.get("status", {}).get("short", "NS")
        status = FOOTBALL_STATUS_MAP.get(api_status, "scheduled")

        if status in ("cancelled", "abandoned"):
            return None

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

    # =========================================================================
    # ETAPE 1 : LIGUE
    # =========================================================================

    async def ingest_league(self):
        logger.info("=" * 60)
        logger.info("ETAPE 1/9 : Ingestion de la ligue")
        logger.info("=" * 60)

        data = await self._api_get("/leagues", {"id": self.league_id})
        items = data.get("response", [])
        if not items:
            logger.error(f"Ligue {self.league_id} introuvable sur l'API")
            return

        raw = items[0]
        league_data = raw.get("league", {})
        country_data = raw.get("country", {})
        seasons = raw.get("seasons", [])

        current_season = None
        for s in seasons:
            if s.get("year") == self.season:
                current_season = s
                break
        if not current_season and seasons:
            current_season = seasons[-1]

        row = {
            "api_id": league_data.get("id"),
            "sport": "football",
            "name": league_data.get("name", ""),
            "country": country_data.get("name", ""),
            "tier": "major",
            "season_start": current_season.get("start") if current_season else None,
            "season_end": current_season.get("end") if current_season else None,
        }

        if not self.dry_run:
            self.analytics.upsert("leagues", [row], on_conflict="api_id,sport")
        self.report["league"]["upserted"] = 1
        self._load_league_id_map()

        internal_id = self._league_id_map.get(self.league_id)
        logger.info(f"  Ligue '{row['name']}' upsertee (internal_id={internal_id})")

    # =========================================================================
    # ETAPE 2 : EQUIPES
    # =========================================================================

    async def ingest_teams(self):
        logger.info("=" * 60)
        logger.info("ETAPE 2/9 : Ingestion des equipes")
        logger.info("=" * 60)

        internal_league_id = self._league_id_map.get(self.league_id)
        if not internal_league_id:
            logger.error("Ligue non trouvee en base, impossible d'ingerer les equipes")
            return

        data = await self._api_get("/teams", {"league": self.league_id, "season": self.season})
        items = data.get("response", [])
        logger.info(f"  {len(items)} equipes trouvees sur l'API")

        rows = []
        for item in items:
            team_data = item.get("team", {})
            venue_data = item.get("venue", {})
            api_id = team_data.get("id")
            self._competition_team_api_ids.add(api_id)
            rows.append({
                "api_id": api_id,
                "sport": "football",
                "name": team_data.get("name", ""),
                "short_name": team_data.get("code", "") or "",
                "logo_url": team_data.get("logo", ""),
                "league_id": internal_league_id,
                "stadium_city": venue_data.get("city", "") or "",
            })

        if not self.dry_run and rows:
            for i in range(0, len(rows), 50):
                self.analytics.upsert("teams", rows[i : i + 50], on_conflict="api_id,sport")

        self.report["teams"]["upserted"] = len(rows)
        self._load_team_id_map()
        logger.info(f"  {len(rows)} equipes upsertees")

    # =========================================================================
    # ETAPE 3 : FIXTURES COMPETITION
    # =========================================================================

    async def ingest_competition_fixtures(self):
        logger.info("=" * 60)
        logger.info("ETAPE 3/9 : Ingestion des fixtures de la competition")
        logger.info("=" * 60)

        data = await self._api_get("/fixtures", {"league": self.league_id, "season": self.season})
        items = data.get("response", [])
        logger.info(f"  {len(items)} fixtures trouvees sur l'API")

        rows = []
        skipped = 0
        for item in items:
            row = self._transform_match(item)
            if row:
                rows.append(row)
            else:
                skipped += 1

        if skipped:
            logger.warning(f"  {skipped} fixtures ignorees (IDs non resolus)")

        if not self.dry_run and rows:
            self.analytics.upsert("football_matches", rows, on_conflict="api_id")

        self.report["fixtures"]["upserted"] = len(rows)
        logger.info(f"  {len(rows)} fixtures upsertees")

    # =========================================================================
    # ETAPE 4 : MATCHS HISTORIQUES
    # =========================================================================

    def _ensure_leagues_from_fixtures(self, raw_items: list[dict]):
        """Upsert les ligues inconnues extraites des reponses fixtures."""
        new_leagues = {}
        for item in raw_items:
            league = item.get("league", {})
            league_api_id = league.get("id")
            if league_api_id and league_api_id not in self._league_id_map:
                new_leagues[league_api_id] = {
                    "api_id": league_api_id,
                    "sport": "football",
                    "name": league.get("name", ""),
                    "country": league.get("country", ""),
                    "tier": "minor",
                }

        if new_leagues and not self.dry_run:
            self.analytics.upsert(
                "leagues", list(new_leagues.values()), on_conflict="api_id,sport"
            )
            self.report["history"]["new_leagues"] += len(new_leagues)
            logger.info(f"    +{len(new_leagues)} nouvelles ligues ajoutees")
        if not self.dry_run:
            self._load_league_id_map()

    def _ensure_teams_from_fixtures(self, raw_items: list[dict]):
        """Upsert les equipes inconnues extraites des reponses fixtures."""
        new_teams = {}
        for item in raw_items:
            league = item.get("league", {})
            league_api_id = league.get("id")
            internal_league_id = self._league_id_map.get(league_api_id)
            if not internal_league_id:
                continue

            for side in ("home", "away"):
                team = item.get("teams", {}).get(side, {})
                team_api_id = team.get("id")
                if team_api_id and team_api_id not in self._team_id_map:
                    new_teams[team_api_id] = {
                        "api_id": team_api_id,
                        "sport": "football",
                        "name": team.get("name", ""),
                        "short_name": "",
                        "logo_url": team.get("logo", ""),
                        "league_id": internal_league_id,
                        "stadium_city": "",
                    }

        if new_teams and not self.dry_run:
            teams_list = list(new_teams.values())
            for i in range(0, len(teams_list), 50):
                self.analytics.upsert(
                    "teams", teams_list[i : i + 50], on_conflict="api_id,sport"
                )
            self._load_team_id_map()
            self.report["history"]["new_teams"] += len(new_teams)
            logger.info(f"    +{len(new_teams)} nouvelles equipes ajoutees")

    async def ingest_historical_matches(self):
        logger.info("=" * 60)
        logger.info("ETAPE 4/9 : Ingestion des matchs historiques")
        logger.info("=" * 60)

        if not self.history_seasons:
            logger.info("  Aucune saison historique specifiee, etape ignoree")
            return

        total_matches = 0
        team_list = sorted(self._competition_team_api_ids)
        logger.info(
            f"  {len(team_list)} equipes x {len(self.history_seasons)} saisons = "
            f"~{len(team_list) * len(self.history_seasons)} appels API"
        )

        for idx, team_api_id in enumerate(team_list, 1):
            team_name = self._get_team_name_by_api_id(team_api_id)
            logger.info(f"  [{idx}/{len(team_list)}] {team_name} (api_id={team_api_id})")

            all_raw_items = []
            for season_year in self.history_seasons:
                try:
                    data = await self._api_get(
                        "/fixtures", {"team": team_api_id, "season": season_year}
                    )
                    items = data.get("response", [])
                    all_raw_items.extend(items)
                    await asyncio.sleep(0.5)
                except QuotaExceededError:
                    logger.error("  QUOTA API ATTEINT — arret de l'etape 4")
                    self.report["history"]["errors"].append("quota_exceeded")
                    return
                except Exception as e:
                    logger.error(f"    Erreur saison {season_year}: {e}")
                    self.report["history"]["errors"].append(
                        f"team={team_api_id},season={season_year}: {e}"
                    )

            if not all_raw_items:
                continue

            self._ensure_leagues_from_fixtures(all_raw_items)
            self._ensure_teams_from_fixtures(all_raw_items)

            rows = []
            for item in all_raw_items:
                row = self._transform_match(item)
                if row:
                    rows.append(row)

            if not self.dry_run and rows:
                for i in range(0, len(rows), 500):
                    self.analytics.upsert(
                        "football_matches", rows[i : i + 500], on_conflict="api_id"
                    )

            total_matches += len(rows)
            logger.info(f"    {len(rows)} matchs upserted (total: {total_matches})")

        self.report["history"]["matches"] = total_matches
        logger.info(f"  Total matchs historiques: {total_matches}")

    def _build_team_name_cache(self):
        """Charge un cache api_id -> name pour le logging."""
        rows = self.analytics.select("teams", "id,api_id,name", {"sport": "football"})
        self._team_name_cache = {r["api_id"]: r["name"] for r in rows}

    def _get_team_name_by_api_id(self, api_id: int) -> str:
        if not hasattr(self, "_team_name_cache"):
            self._build_team_name_cache()
        return self._team_name_cache.get(api_id, f"Unknown({api_id})")

    # =========================================================================
    # ETAPE 5 : STATS DES MATCHS
    # =========================================================================

    async def ingest_match_stats(self):
        logger.info("=" * 60)
        logger.info("ETAPE 5/9 : Ingestion des stats de matchs")
        logger.info("=" * 60)

        from scripts.updates.update_match_stats import SingleMatchStatsUpdater

        existing_stats_ids = set()
        offset = 0
        while True:
            batch = self.analytics.select_raw(
                "football_match_stats", f"select=match_id&limit=1000&offset={offset}"
            )
            if not batch:
                break
            existing_stats_ids.update(r["match_id"] for r in batch)
            if len(batch) < 1000:
                break
            offset += 1000

        all_finished = []
        offset = 0
        while True:
            batch = self.analytics.select_raw(
                "football_matches",
                f"select=api_id&status=eq.finished&limit=1000&offset={offset}",
            )
            if not batch:
                break
            all_finished.extend(batch)
            if len(batch) < 1000:
                break
            offset += 1000

        missing = [m["api_id"] for m in all_finished if m["api_id"] not in existing_stats_ids]
        logger.info(
            f"  {len(all_finished)} matchs finis, {len(existing_stats_ids)} avec stats, "
            f"{len(missing)} a traiter"
        )

        if not missing:
            return

        updater = SingleMatchStatsUpdater()
        processed = 0

        for i, api_id in enumerate(missing, 1):
            try:
                if self._api_call_count >= self.max_api_calls:
                    logger.warning("  Quota API atteint — arret de l'etape 5")
                    break
                self._api_call_count += 1
                if not self.dry_run:
                    await updater.update_football(api_id)
                processed += 1
                if i % 50 == 0:
                    logger.info(f"    Progress: {i}/{len(missing)}")
                await asyncio.sleep(0.5)
            except Exception as e:
                logger.error(f"    Erreur stats match {api_id}: {e}")
                self.report["stats"]["errors"].append(f"{api_id}: {e}")

        self.report["stats"]["processed"] = processed
        self.report["stats"]["skipped"] = len(missing) - processed
        logger.info(f"  {processed} matchs traites")

    # =========================================================================
    # ETAPE 6 : H2H
    # =========================================================================

    async def compute_h2h(self):
        logger.info("=" * 60)
        logger.info("ETAPE 6/9 : Calcul H2H")
        logger.info("=" * 60)

        from scripts.updates.update_match_h2h import SingleMatchH2HUpdater

        competition_internal_ids = set()
        for api_id in self._competition_team_api_ids:
            internal = self._team_id_map.get(api_id)
            if internal:
                competition_internal_ids.add(internal)

        if len(competition_internal_ids) < 2:
            logger.warning("  Moins de 2 equipes, H2H impossible")
            return

        ids_str = ",".join(map(str, competition_internal_ids))
        query = (
            f"select=home_team_id,away_team_id&status=eq.finished"
            f"&or=(home_team_id.in.({ids_str}),away_team_id.in.({ids_str}))"
        )
        matches_for_pairs = []
        offset = 0
        while True:
            batch = self.analytics.select_raw(
                "football_matches", f"{query}&limit=1000&offset={offset}"
            )
            if not batch:
                break
            matches_for_pairs.extend(batch)
            if len(batch) < 1000:
                break
            offset += 1000

        pairs = set()
        for m in matches_for_pairs:
            a, b = m["home_team_id"], m["away_team_id"]
            if a in competition_internal_ids and b in competition_internal_ids:
                pairs.add((min(a, b), max(a, b)))

        logger.info(f"  {len(pairs)} paires uniques a traiter")

        if not pairs:
            return

        h2h_updater = SingleMatchH2HUpdater("football")

        try:
            processed = 0
            for team_a, team_b in sorted(pairs):
                try:
                    if self._api_call_count >= self.max_api_calls:
                        logger.warning("  Quota API atteint — arret de l'etape 6")
                        break
                    self._api_call_count += 1

                    api_a = self._team_id_reverse.get(team_a)
                    api_b = self._team_id_reverse.get(team_b)
                    if not api_a or not api_b:
                        continue

                    resp = await h2h_updater.client.get(
                        "/fixtures/headtohead", params={"h2h": f"{api_a}-{api_b}"}
                    )
                    resp.raise_for_status()
                    data = resp.json().get("response", [])

                    if data:
                        row = h2h_updater.process_api_response(data, team_a, team_b, api_a)
                        if row and not self.dry_run:
                            self.analytics.upsert(
                                "football_h2h", [row], on_conflict="team_a_id,team_b_id"
                            )
                    processed += 1
                    if processed % 20 == 0:
                        logger.info(f"    Progress: {processed}/{len(pairs)}")
                    await asyncio.sleep(0.5)
                except Exception as e:
                    logger.error(f"    Erreur H2H ({team_a} vs {team_b}): {e}")
                    self.report["h2h"]["errors"].append(f"{team_a}-{team_b}: {e}")

            self.report["h2h"]["pairs"] = processed
            logger.info(f"  {processed} paires traitees")
        finally:
            await h2h_updater.close()

    # =========================================================================
    # ETAPE 7 : ROLLING
    # =========================================================================

    def compute_rolling_stats(self):
        logger.info("=" * 60)
        logger.info("ETAPE 7/9 : Calcul Rolling L5")
        logger.info("=" * 60)

        from engine.compute_rolling import compute_football_rolling

        count = compute_football_rolling(self.analytics, dry_run=self.dry_run)
        self.report["rolling"]["rows"] = count
        logger.info(f"  {count} lignes rolling")

    # =========================================================================
    # ETAPE 8 : ELO
    # =========================================================================

    def compute_elo_ratings(self):
        logger.info("=" * 60)
        logger.info("ETAPE 8/9 : Calcul ELO")
        logger.info("=" * 60)

        from engine.compute_elo import compute_elo_for_sport

        compute_elo_for_sport("football", self.analytics, dry_run=self.dry_run)
        logger.info("  ELO recalcule")

    # =========================================================================
    # ETAPE 9 : SYNC PUBLIC.MATCHES
    # =========================================================================

    def sync_public_matches(self):
        logger.info("=" * 60)
        logger.info("ETAPE 9/9 : Sync public.matches")
        logger.info("=" * 60)

        internal_league_id = self._league_id_map.get(self.league_id)
        if not internal_league_id:
            logger.error("  Ligue non trouvee en base")
            return

        teams_cache = {}
        for row in self.analytics.select("teams", "id,name,short_name,logo_url", {"sport": "football"}):
            teams_cache[row["id"]] = row
        leagues_cache = {}
        for row in self.analytics.select("leagues", "id,name,country", {"sport": "football"}):
            leagues_cache[row["id"]] = row
        logger.info(f"  Caches charges : {len(teams_cache)} equipes, {len(leagues_cache)} ligues")

        matches = []
        offset = 0
        while True:
            batch = self.analytics.select_raw(
                "football_matches",
                f"select=*&league_id=eq.{internal_league_id}&limit=500&offset={offset}",
            )
            if not batch:
                break
            matches.extend(batch)
            if len(batch) < 500:
                break
            offset += 500

        logger.info(f"  {len(matches)} matchs de la competition a synchroniser")

        valid_public_statuses = ("upcoming", "imminent", "live", "finished")
        public_rows = []
        for m in matches:
            home_info = teams_cache.get(m.get("home_team_id"))
            away_info = teams_cache.get(m.get("away_team_id"))
            league_info = leagues_cache.get(m.get("league_id"))
            if not home_info or not away_info:
                continue

            analytics_status = m.get("status", "scheduled")
            public_status = ANALYTICS_TO_PUBLIC_STATUS.get(analytics_status, "upcoming")
            if public_status not in valid_public_statuses:
                public_status = "upcoming"

            score_obj = None
            if m.get("home_score") is not None:
                score_obj = {"home": m["home_score"], "away": m.get("away_score")}

            meta = {}
            if m.get("round"):
                meta["round"] = m["round"]
            if m.get("referee_name"):
                meta["referee"] = m["referee_name"]
            if league_info:
                meta["country"] = league_info.get("country", "")

            public_rows.append({
                "api_sport_id": str(m["api_id"]),
                "sport": "football",
                "league_name": league_info.get("name", "") if league_info else "",
                "home_team": {
                    "id": m.get("home_team_id"),
                    "name": home_info.get("name", ""),
                    "logo": home_info.get("logo_url", ""),
                    "code": home_info.get("short_name", ""),
                },
                "away_team": {
                    "id": m.get("away_team_id"),
                    "name": away_info.get("name", ""),
                    "logo": away_info.get("logo_url", ""),
                    "code": away_info.get("short_name", ""),
                },
                "date_time": m.get("date_time"),
                "status": public_status,
                "score": score_obj,
                "tournament_meta": meta if meta else None,
            })

        if not self.dry_run and public_rows:
            for i in range(0, len(public_rows), 50):
                self.public.upsert(
                    "matches", public_rows[i : i + 50], on_conflict="api_sport_id,sport"
                )

        self.report["public_sync"]["upserted"] = len(public_rows)
        logger.info(f"  {len(public_rows)} matchs synchronises vers public.matches")

    # =========================================================================
    # ORCHESTRATION
    # =========================================================================

    async def run(self, skip: dict) -> dict:
        t0 = time.time()

        await self.ingest_league()
        await self.ingest_teams()
        await self.ingest_competition_fixtures()

        if not skip.get("history"):
            await self.ingest_historical_matches()

        if not skip.get("stats"):
            await self.ingest_match_stats()

        if not skip.get("h2h"):
            await self.compute_h2h()

        if not skip.get("rolling"):
            self.compute_rolling_stats()

        if not skip.get("elo"):
            self.compute_elo_ratings()

        if not skip.get("public_sync"):
            self.sync_public_matches()

        self.report["api_calls_total"] = self._api_call_count
        self.report["duration_seconds"] = round(time.time() - t0, 1)

        logger.info("=" * 60)
        logger.info("TERMINE")
        logger.info(json.dumps(self.report, indent=2, default=str))
        return self.report

    async def close(self):
        await self.http.aclose()


# =============================================================================
# CLI
# =============================================================================


def main():
    parser = argparse.ArgumentParser(
        description="Ingestion complete d'une competition football"
    )
    parser.add_argument("--league-id", type=int, required=True, help="ID API-Football de la ligue")
    parser.add_argument("--season", type=int, required=True, help="Saison (ex: 2026)")
    parser.add_argument(
        "--qualifier-leagues", type=str, default="",
        help="IDs des ligues de qualification, separes par virgule",
    )
    parser.add_argument(
        "--history-seasons", type=str, default="",
        help="Saisons historiques a recuperer, separees par virgule",
    )
    parser.add_argument("--dry-run", action="store_true", help="Preview sans ecriture DB")
    parser.add_argument("--skip-history", action="store_true")
    parser.add_argument("--skip-stats", action="store_true")
    parser.add_argument("--skip-h2h", action="store_true")
    parser.add_argument("--skip-rolling", action="store_true")
    parser.add_argument("--skip-elo", action="store_true")
    parser.add_argument("--skip-public-sync", action="store_true")
    parser.add_argument("--max-api-calls", type=int, default=7000, help="Plafond d'appels API")

    args = parser.parse_args()

    qualifier_ids = [int(x) for x in args.qualifier_leagues.split(",") if x.strip()]
    history_seasons = [int(x) for x in args.history_seasons.split(",") if x.strip()]

    skip = {
        "history": args.skip_history,
        "stats": args.skip_stats,
        "h2h": args.skip_h2h,
        "rolling": args.skip_rolling,
        "elo": args.skip_elo,
        "public_sync": args.skip_public_sync,
    }

    async def _run():
        ingester = CompetitionIngester(
            league_id=args.league_id,
            season=args.season,
            qualifier_league_ids=qualifier_ids,
            history_seasons=history_seasons,
            dry_run=args.dry_run,
            max_api_calls=args.max_api_calls,
        )
        try:
            await ingester.run(skip)
        finally:
            await ingester.close()

    asyncio.run(_run())


if __name__ == "__main__":
    main()
