"""
BETIX — monitor_live.py
Live Monitor: tracks 'live' matches.
1. Updates the score in real time (for live tracking).
2. When a match ends, triggers the completion sequence via the pipelines.

Ideal frequency: every 2 minutes.
"""

import asyncio
import logging
import sys
import os
from datetime import datetime, timezone

# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST

# Import Upserters and Pipelines
from scripts.updates.upsert_fb_data import FBMatchUpserter
from scripts.updates.upsert_tennis_data import TennisMatchUpserter
from scripts.updates.pipeline_fb import run_fb_pipeline
from scripts.updates.pipeline_tennis import run_tennis_pipeline

logger = logging.getLogger("betix.live_monitor")

class LiveMatchMonitor:
    def __init__(self):
        settings = get_settings()
        self.db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="analytics")
        
        self.fb_upserter = FBMatchUpserter(self.db, {
            "football": settings.API_SPORTS_KEY,
            "basketball": settings.API_SPORTS_KEY
        })
        self.tennis_upserter = TennisMatchUpserter(self.db, settings.API_TENNIS_KEY)

    async def get_live_matches(self):
        """Fetches all matches with status='live'."""
        matches = []
        for sport in ["football", "basketball", "tennis"]:
            table = f"{sport}_matches"
            # We fetch all necessary fields for Upserters
            if sport == "tennis":
                query = "status=eq.live&select=id,api_id,status,date_time,sets_played,score"
            else:
                query = "status=eq.live&select=id,api_id,status,date_time,home_score,away_score,status_short"
                
            try:
                rows = self.db.select_raw(table, query)
                for r in rows:
                    r["sport"] = sport
                    matches.append(r)
            except Exception as e:
                logger.error(f"❌ DB Error checking {sport}: {e}")
        return matches

    async def check_and_update(self, match):
        """Uses the Upserters to update and check whether the match has finished."""
        sport = match["sport"]
        api_id = match["api_id"]
        
        try:
            if sport in ["football", "basketball"]:
                is_finished = await self.fb_upserter.process_match(sport, match)
            elif sport == "tennis":
                is_finished = await self.tennis_upserter.process_match(match)
            else:
                return None
                
            if is_finished:
                logger.info(f"🏁 Match {sport.upper()} {api_id} JUST FINISHED.")
                return match
                
            return None
        except Exception as e:
            logger.error(f"❌ Error processing {sport} {api_id}: {e}")
            return None

    async def run(self):
        try:
            live_matches = await self.get_live_matches()
            if not live_matches:
                logger.info("💤 No live matches monitored.")
                return

            logger.info(f"🟢 Monitoring {len(live_matches)} LIVE matches...")
            
            # Parallel execution of updates
            tasks = [self.check_and_update(m) for m in live_matches]
            results = await asyncio.gather(*tasks)
            
            finished_matches = [m for m in results if m is not None]
            
            if finished_matches:
                logger.info(f"🚀 Triggering completion pipelines for {len(finished_matches)} finished matches...")
                
                fb_targets = [{"api_id": m["api_id"], "sport": m["sport"]} for m in finished_matches if m["sport"] in ["football", "basketball"]]
                tennis_targets = [m["api_id"] for m in finished_matches if m["sport"] == "tennis"]
                
                if fb_targets:
                    run_fb_pipeline(fb_targets)
                if tennis_targets:
                    run_tennis_pipeline(tennis_targets)
                    
            logger.info("✅ Live Monitoring Cycle Complete.")
        finally:
            await self.fb_upserter.close()
            await self.tennis_upserter.close()

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s — %(message)s")
    monitor = LiveMatchMonitor()
    asyncio.run(monitor.run())
