"""
BETIX — mark_imminent.py
Automatic radar: detects matches starting in less than 3 hours and flips
their status from 'scheduled' to 'imminent', verifying via the API.

Ideal frequency: every 15 minutes.
"""

import asyncio
import logging
import sys
import os
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST
from scripts.updates.upsert_fb_data import FBMatchUpserter
from scripts.updates.upsert_tennis_data import TennisMatchUpserter
from scripts.updates.pipeline_fb import run_fb_pipeline
from scripts.updates.pipeline_tennis import run_tennis_pipeline

logger = logging.getLogger("betix.imminent_radar")

class ImminentRadar:
    def __init__(self):
        settings = get_settings()
        self.db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="analytics")
        
        self.fb_upserter = FBMatchUpserter(self.db, {
            "football": settings.API_SPORTS_KEY,
            "basketball": settings.API_SPORTS_KEY
        })
        self.tennis_upserter = TennisMatchUpserter(self.db, settings.API_TENNIS_KEY)

    async def get_target_matches(self):
        now_utc = datetime.now(timezone.utc)
        limit_time = now_utc + timedelta(hours=3)
        
        now_str = now_utc.strftime("%Y-%m-%dT%H:%M:%S") + "Z"
        limit_str = limit_time.strftime("%Y-%m-%dT%H:%M:%S") + "Z"
        
        matches = []
        for sport in ["football", "basketball", "tennis"]:
            table = f"{sport}_matches"
            if sport == "tennis":
                query = f"status=eq.scheduled&date_time=gte.{now_str}&date_time=lte.{limit_str}&select=id,api_id,status,date_time,sets_played,score"
            else:
                query = f"status=eq.scheduled&date_time=gte.{now_str}&date_time=lte.{limit_str}&select=id,api_id,status,date_time,home_score,away_score,status_short"
                
            try:
                rows = self.db.select_raw(table, query)
                for r in rows:
                    r["sport"] = sport
                    matches.append(r)
            except Exception as e:
                logger.error(f"❌ DB Error checking {sport}: {e}")
        return matches

    async def check_and_update(self, match):
        sport = match["sport"]
        api_id = match["api_id"]
        table = f"{sport}_matches"
        
        try:
            # 1. Process with the Upserter (updates score/date/status if postponed/started)
            if sport in ["football", "basketball"]:
                is_finished = await self.fb_upserter.process_match(sport, match)
            elif sport == "tennis":
                is_finished = await self.tennis_upserter.process_match(match)
            else:
                return None
                
            if is_finished:
                logger.info(f"🏁 Match {sport.upper()} {api_id} JUST FINISHED (very early!).")
                return match
                
            # 2. Check whether the status is still 'scheduled' AND the date is still within the 3h window
            updated_row = self.db.select_raw(table, f"select=status,date_time&api_id=eq.{api_id}")
            if updated_row and updated_row[0].get("status") == "scheduled":
                # Re-check that the updated date is still within the next 3 hours
                new_dt_str = updated_row[0].get("date_time", "")
                still_imminent = False
                if new_dt_str:
                    try:
                        new_dt = datetime.fromisoformat(new_dt_str.replace("Z", "+00:00"))
                        now_utc = datetime.now(timezone.utc)
                        hours_until = (new_dt - now_utc).total_seconds() / 3600
                        still_imminent = 0 <= hours_until <= 3
                    except (ValueError, TypeError):
                        pass

                if still_imminent:
                    self.db.update(table, {"status": "imminent"}, {"api_id": api_id})
                    logger.info(f"   --> Forced {sport.upper()} {api_id} to IMMINENT.")
                else:
                    logger.info(f"   💤 {sport.upper()} {api_id}: updated date is outside the 3h window, staying scheduled.")
                
            return None
        except Exception as e:
            logger.error(f"❌ Error processing {sport} {api_id}: {e}")
            return None

    async def run(self):
        try:
            matches = await self.get_target_matches()
            if not matches:
                logger.info("💤 No upcoming matches (< 3h) found.")
                return

            logger.info(f"📡 Imminent Radar: Scanning {len(matches)} matches...")
            
            tasks = [self.check_and_update(m) for m in matches]
            results = await asyncio.gather(*tasks)
            
            finished_matches = [m for m in results if m is not None]
            
            if finished_matches:
                logger.info(f"🚀 Triggering completion pipelines for {len(finished_matches)} finished matches...")
                fb_targets = [{"api_id": m["api_id"], "sport": m["sport"]} for m in finished_matches if m["sport"] in ["football", "basketball"]]
                tennis_targets = [m["api_id"] for m in finished_matches if m["sport"] == "tennis"]
                
                if fb_targets: run_fb_pipeline(fb_targets)
                if tennis_targets: run_tennis_pipeline(tennis_targets)
                    
            logger.info("✅ Radar Imminent Cycle Complete.")
        finally:
            await self.fb_upserter.close()
            await self.tennis_upserter.close()

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s — %(message)s")
    radar = ImminentRadar()
    asyncio.run(radar.run())
