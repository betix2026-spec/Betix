import asyncio
import os
import sys
import logging
import httpx
from datetime import datetime, timedelta, timezone

# Path setup for imports
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST

# Main logger
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s — %(message)s")
logger = logging.getLogger("betix.daily_orchestrator")

class DailyMatchOrchestrator:
    """
    Orchestrates the daily match update across all sports.
    Uses a two-sequence approach:
    1. Sequence 1 (Tennis): via API-Tennis
    2. Sequence 2 (Football/Basketball): via API-Sports
    """
    def __init__(self):
        settings = get_settings()
        self.db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="analytics")
        # public.matches — see FBMatchUpserter._sync_public (upsert_fb_data.py).
        self.public_db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
        self.sports = ["football", "basketball", "tennis"]

    async def run(self):
        logger.info("🚀 Starting the match update orchestrator.")

        # 1. Scan window (-10d to +10d to cover date shifts and late results)
        today = datetime.utcnow().date()
        start_date = (today - timedelta(days=10)).strftime("%Y-%m-%dT00:00:00Z")
        end_date = (today + timedelta(days=10)).strftime("%Y-%m-%dT23:59:59Z")

        logger.info(f"📅 Scan window: from {start_date} to {end_date}")

        # 2. Fetch unfinished or recent matches
        sport_targets = {}

        for sport in self.sports:
            table = f"{sport}_matches"
            url = f"{self.db.base_url}/{table}"

            # Fetch matches that aren't 'finished' yet, for verification
            query_str = f"select=id,api_id,status,date_time&date_time=gte.{start_date}&date_time=lte.{end_date}&status=not.in.(finished,cancelled)&limit=10000"
            full_url = f"{url}?{query_str}"

            try:
                resp = httpx.get(full_url, headers=self.db.headers)
                resp.raise_for_status()
                rows = resp.json()
                sport_targets[sport] = rows
                logger.info(f"📊 {sport.capitalize()}: {len(rows)} matches to verify.")
            except Exception as e:
                logger.error(f"❌ Error fetching matches for {sport}: {e}")
                sport_targets[sport] = []

        # 3. Run the per-sport sequences
        logger.info("\n⚙️ --- RUNNING SEQUENCES --- ⚙️")

        for sport_key, target_ids in sport_targets.items():
            if not target_ids:
                logger.info(f"💤 No targets for {sport_key.capitalize()}, sequence skipped.")
                continue

            if sport_key == "tennis":
                await self.sequence_1(sport_key, target_ids)
            elif sport_key in ["football", "basketball"]:
                await self.sequence_2(sport_key, target_ids)
            else:
                logger.warning(f"⚠️ Unknown sequence for sport: {sport_key}")

        # 4. Safety net: matches stuck for >12h -> cancelled
        await self.cleanup_stuck_matches()

        logger.info("🏁 Daily orchestration complete.")

    async def sequence_1(self, sport: str, matches: list):
        """Sequence dedicated to Tennis (API-Tennis)"""
        logger.info(f"\n🎾 [SEQUENCE 1 - TENNIS] Targets: {len(matches)}")

        settings = get_settings()
        api_key = settings.API_TENNIS_KEY
        missing_stats_ids = []

        # Local import of update modules
        from upsert_tennis_data import TennisMatchUpserter
        from pipeline_tennis import run_tennis_pipeline

        upserter = TennisMatchUpserter(self.db, api_key, public_db_client=self.public_db)

        for m in matches:
            api_id = m["api_id"]
            # logger.info(f"🔎 Verifying API match {api_id}")

            # Robust upsert (handles date shifts, scores, status)
            is_finished = await upserter.process_match(m)

            # If the match just finished or is finished, check the stats
            if is_finished:
                stats_rows = self.db.select("tennis_match_stats", "match_id", {"match_id": m["id"]})
                if len(stats_rows) < 2:
                    logger.info(f"   📌 Match {api_id}: Missing stats, adding to the pipeline.")
                    missing_stats_ids.append(api_id)

        # Trigger the Tennis pipeline
        if missing_stats_ids:
            run_tennis_pipeline(missing_stats_ids)

        return missing_stats_ids

    async def sequence_2(self, sport: str, matches: list):
        """Sequence dedicated to Football/Basketball (API-Sports)"""
        logger.info(f"\n⚽🏀 [SEQUENCE 2 - {sport.upper()}] Targets: {len(matches)}")

        settings = get_settings()

        from upsert_fb_data import FBMatchUpserter
        from pipeline_fb import run_fb_pipeline

        upserter = FBMatchUpserter(self.db, {
            "football": settings.API_SPORTS_KEY,
            "basketball": settings.API_SPORTS_KEY
        }, public_db_client=self.public_db)

        missing_stats_targets = []

        for m in matches:
            api_id = m["api_id"]

            # Upsert match data
            is_finished = await upserter.process_match(sport, m)

            if is_finished:
                # Check whether stats exist in the DB
                try:
                    res = self.db.select_raw(f"{sport}_match_stats", f"select=match_id&match_id=eq.{api_id}")
                    if not res:
                        logger.info(f"   📌 Match {api_id}: Missing stats, adding to the pipeline.")
                        missing_stats_targets.append({"api_id": api_id, "sport": sport})
                except Exception as e:
                    logger.error(f"   ❌ Error checking stats {sport} {api_id}: {e}")

        # Trigger the FB pipeline
        if missing_stats_targets:
            run_fb_pipeline(missing_stats_targets)

    async def cleanup_stuck_matches(self):
        """Safety net: forces 'cancelled' for any match still
        scheduled/imminent whose kick-off is more than 12 hours overdue."""
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=12)).strftime("%Y-%m-%dT%H:%M:%SZ")

        for sport in self.sports:
            table = f"{sport}_matches"
            query = f"status=in.(scheduled,imminent)&date_time=lte.{cutoff}&select=id,api_id,status"
            try:
                stuck = self.db.select_raw(table, query)
                if not stuck:
                    continue
                logger.warning(f"🧹 {sport.upper()}: {len(stuck)} stuck matches (>12h) → cancelled")
                for m in stuck:
                    # NOTE: status_short is hardcoded in French here ("Annulé") —
                    # a real content gap (French reaching a user's view), not a
                    # code comment, so left untouched by this English sweep.
                    # Flagged separately; see session summary.
                    self.db.update(table, {"status": "cancelled", "status_short": "Annulé"}, {"api_id": m["api_id"]})
                    logger.info(f"   🔒 {sport} api_id={m['api_id']} → cancelled (stuck >12h)")
            except Exception as e:
                logger.error(f"❌ Cleanup error {sport}: {e}")

if __name__ == "__main__":
    orchestrator = DailyMatchOrchestrator()
    asyncio.run(orchestrator.run())
