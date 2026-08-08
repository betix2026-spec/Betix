"""
BETIX — IngestionOrchestrator
Drives the sequential ingestion pipeline:
  1. Leagues → 2. Teams → 3. Matches → 4. Public sync
Guarantees dependency order (no FK violations).
"""

import asyncio
import logging
from datetime import datetime, timezone

from .football_client import FootballClient
from .basketball_client import BasketballClient
from .base_client import BaseSportClient

logger = logging.getLogger("betix.ingestion.orchestrator")


class IngestionOrchestrator:
    """
    Orchestrates ingestion for all active sports.
    Respects the order: Leagues → Teams → Matches.
    """

    def __init__(self) -> None:
        self.clients: list[BaseSportClient] = [
            FootballClient(),
            BasketballClient(),
        ]

    async def run_initial_import(self) -> dict:
        """
        Initial import: Leagues + Teams for all sports.
        Run once, or to refresh the reference data.
        """
        report = {"leagues": 0, "teams": 0, "errors": []}

        for client in self.clients:
            try:
                logger.info(f"=== Initial Import: {client.sport.upper()} ===")

                # Step 1: Leagues
                leagues_count = await client.ingest_leagues()
                report["leagues"] += leagues_count

                # Step 2: Teams
                teams_count = await client.ingest_teams()
                report["teams"] += teams_count

            except Exception as e:
                error_msg = f"[{client.sport}] Initial import failed: {e}"
                logger.error(error_msg, exc_info=True)
                report["errors"].append(error_msg)
            finally:
                await client.close()

        logger.info(f"=== Initial Import Complete: {report} ===")
        return report

    async def run_daily_sync(self, date: str | None = None) -> dict:
        """
        Daily sync: today's matches + enrichment of finished matches.
        The client ingests into analytics then syncs to public.matches.
        Then enriches finished matches that are missing stats.

        Args:
            date: Format "YYYY-MM-DD". If None, uses today's date.
        """
        if not date:
            date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        report = {"date": date, "matches": 0, "enrichment": {}, "errors": []}

        for client in self.clients:
            try:
                logger.info(f"=== Daily Sync: {client.sport.upper()} for {date} ===")
                matches_count = await client.ingest_matches(date)
                report["matches"] += matches_count

            except Exception as e:
                error_msg = f"[{client.sport}] Daily sync failed: {e}"
                logger.error(error_msg, exc_info=True)
                report["errors"].append(error_msg)
            finally:
                await client.close()
                pass

        # Post-match enrichment: fetch stats for finished matches without stats
        try:
            enrichment_report = await self.run_post_match_enrichment()
            report["enrichment"] = enrichment_report
        except Exception as e:
            error_msg = f"Post-match enrichment failed: {e}"
            logger.error(error_msg, exc_info=True)
            report["errors"].append(error_msg)

        logger.info(f"=== Daily Sync Complete: {report} ===")
        return report

    async def run_post_match_enrichment(self) -> dict:
        """
        Enriches finished matches that don't have stats yet.
        Then recomputes the derived tables (H2H, ELO, Rolling, Referee).
        """
        from app.services.enrichment.compute_h2h import compute_football_h2h, compute_basketball_h2h
        from app.services.enrichment.compute_elo import compute_football_elo
        from app.services.enrichment.compute_rolling import compute_football_rolling, compute_basketball_rolling
        from app.services.enrichment.compute_referee_stats import compute_referee_stats

        logger.info("=== Post-Match Enrichment ===")
        report = {"stats": 0, "injuries": 0, "errors": []}

        # 1. Fetch stats for finished matches (using enrich_historical logic)
        try:
            import sys
            sys.path.insert(0, ".")
            from enrich_historical import HistoricalEnricher
            enricher = HistoricalEnricher(dry_run=False, max_requests=500)
            await enricher.enrich_football()
            await enricher.enrich_basketball()
            report["stats"] = enricher.report["stats_inserted"]
            report["injuries"] = enricher.report["injuries_inserted"]
        except Exception as e:
            report["errors"].append(f"Stats enrichment error: {e}")
            logger.error(f"Stats enrichment error: {e}", exc_info=True)

        # 2. Recalculate computed tables
        try:
            await compute_football_h2h()
            await compute_basketball_h2h()
            await compute_football_elo()
            await compute_football_rolling()
            await compute_basketball_rolling()
            await compute_referee_stats()
            logger.info("✅ All computed tables recalculated")
        except Exception as e:
            report["errors"].append(f"Computed tables error: {e}")
            logger.error(f"Computed tables error: {e}", exc_info=True)

        logger.info(f"=== Post-Match Enrichment Complete: {report} ===")
        return report

    async def run_upcoming_sync(self, days: int = 14) -> dict:
        """
        Syncs matches for the next X days.
        """
        from datetime import timedelta
        
        start_date = datetime.now(timezone.utc)
        report = {"days_processed": 0, "total_matches": 0, "errors": []}
        
        logger.info(f"=== Upcoming Sync: Starting for {days} days ===")
        
        for i in range(days):
            current_date = (start_date + timedelta(days=i)).strftime("%Y-%m-%d")
            
            # Re-create clients for each day to avoid closed http client issues
            self.clients = [FootballClient(), BasketballClient()]
            
            day_report = await self.run_daily_sync(current_date)
            report["total_matches"] += day_report["matches"]
            report["errors"].extend(day_report["errors"])
            report["days_processed"] += 1
            
            # Small break between days to be nice to API/DB
            await asyncio.sleep(2)

        logger.info(f"=== Upcoming Sync Complete: {report} ===")
        return report

    async def run_live_sync(self) -> dict:
        """
        Triggers a real ingestion pass for live matches across all sports.
        Updates Supabase (analytics + public).
        """
        self.clients = [FootballClient(), BasketballClient()]
        report = {"counts": {}, "total_updated": 0, "errors": []}

        async def _ingest(client):
            try:
                count = await client.ingest_live_matches()
                return client.sport, count, None
            except Exception as e:
                return client.sport, 0, str(e)
            finally:
                await client.close()

        results = await asyncio.gather(*[_ingest(c) for c in self.clients])

        for sport, count, error in results:
            report["counts"][sport] = count
            report["total_updated"] += count
            if error:
                report["errors"].append(f"[{sport}] {error}")

        logger.info(f"=== Live Refresh Complete: {report} ===")
        return report

    async def run_full_pipeline(self, date: str | None = None) -> dict:
        """
        Full pipeline: Initial Import + Daily Sync.
        Useful for the first run or a full reset.
        """
        if not date:
            date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        logger.info(f"=== FULL PIPELINE START for {date} ===")

        # Re-create clients (the previous ones may have been closed)
        self.clients = [FootballClient(), BasketballClient()]

        report = {"leagues": 0, "teams": 0, "matches": 0, "errors": []}

        for client in self.clients:
            try:
                logger.info(f"--- {client.sport.upper()} ---")

                # Step 1: Leagues
                leagues_count = await client.ingest_leagues()
                report["leagues"] += leagues_count

                # Step 2: Teams
                teams_count = await client.ingest_teams()
                report["teams"] += teams_count

                # Step 3: Matches + public sync
                matches_count = await client.ingest_matches(date)
                report["matches"] += matches_count

            except Exception as e:
                error_msg = f"[{client.sport}] Full pipeline failed: {e}"
                logger.error(error_msg, exc_info=True)
                report["errors"].append(error_msg)
            finally:
                await client.close()

        logger.info(f"=== FULL PIPELINE COMPLETE: {report} ===")
        return report
