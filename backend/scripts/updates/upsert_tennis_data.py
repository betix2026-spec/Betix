import logging
from datetime import datetime, timezone
import httpx

from app.services.ingestion.constants import ANALYTICS_TO_PUBLIC_STATUS

logger = logging.getLogger("draft.tennis_upsert")

class TennisMatchUpserter:
    def __init__(self, db_client, api_key: str, public_db_client=None):
        self.db = db_client
        self.api_key = api_key
        # public.matches — see upsert_fb_data.py's FBMatchUpserter for the
        # full explanation. Same gap, same fix, tennis side.
        self.public_db = public_db_client
        self._http_client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Returns a shared HTTP client."""
        if self._http_client is None or self._http_client.is_closed:
            self._http_client = httpx.AsyncClient(timeout=15.0)
        return self._http_client

    async def close(self):
        """Cleanly closes the HTTP client."""
        if self._http_client and not self._http_client.is_closed:
            await self._http_client.aclose()
            self._http_client = None

    async def process_match(self, db_match: dict) -> bool:
        """
        Processes a specific match: Fetch API -> Parse -> Diff -> Update DB.
        Returns True if the processed match is considered 'finished', False otherwise.
        """
        api_id = db_match["api_id"]
        db_id = db_match["id"]
        
        # 1. FETCH API
        raw = await self._fetch_api_data(db_match)
        if not raw:
            # If the match is not found AND its kickoff is >6h overdue → cancelled
            match_dt_str = db_match.get("date_time", "")
            is_overdue = False
            if match_dt_str:
                try:
                    dt = datetime.fromisoformat(match_dt_str.replace("Z", "+00:00"))
                    hours_past = (datetime.now(timezone.utc) - dt).total_seconds() / 3600
                    is_overdue = hours_past > 6
                except (ValueError, TypeError):
                    pass

            if is_overdue and db_match["status"] not in ("finished", "cancelled"):
                logger.warning(f"   ⚠️ Match {api_id} (DB: {db_id}) not found on the API and >6h overdue → cancelled.")
                try:
                    # NOTE: status_short is hardcoded in French here ("Annulé") — a real
                    # content gap (French reaching a user's view), not a code comment,
                    # so left untouched by this English sweep. Same pattern as
                    # process_daily_matches.py; flagged separately, not yet fixed.
                    self.db.update("tennis_matches", {"status": "cancelled", "status_short": "Annulé"}, {"api_id": api_id})
                    self._sync_public(api_id, db_match, {"status": "cancelled", "status_short": "Annulé"})
                except Exception as e:
                    logger.error(f"   ❌ DB error cancelling {api_id}: {e}")
                return False
            else:
                logger.warning(f"   ⚠️ Match {api_id} (DB: {db_id}) not found on the API.")
                return db_match["status"] == "finished"
            
        # 2. ROBUST PARSING
        parsed_data = self._parse_api_payload(raw, db_match)
        
        # 3. DIFF & UPDATE
        updated = self._apply_update_if_needed(api_id, db_match, parsed_data)
        
        return parsed_data["status"] == "finished"

    async def _fetch_api_data(self, db_match: dict) -> dict | None:
        api_id = db_match["api_id"]
        # Fetch the date from the DB to target the API
        db_date_str = db_match["date_time"][:10] if db_match.get("date_time") else datetime.utcnow().strftime("%Y-%m-%d")
        
        from datetime import timedelta
        
        try:
            base_date = datetime.strptime(db_date_str, "%Y-%m-%d")
            client = await self._get_client()
            
            # Optimization: try the exact theoretical date first (i=0)
            # If not found, search around it (-1, -2, 1, 2, 3, 4) since tennis schedules often shift
            search_offsets = [0, -1, 1, -2, 2, 3, 4]
            
            for i in search_offsets:
                target_date = (base_date + timedelta(days=i)).strftime("%Y-%m-%d")
                url = f"https://api.api-tennis.com/tennis/?method=get_fixtures&APIkey={self.api_key}&event_key={api_id}&date_start={target_date}&date_stop={target_date}"
                
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json().get("result", [])
                
                if data:
                    match_data = next((m for m in data if str(m.get("event_key")) == str(api_id)), None)
                    if match_data:
                        if i != 0:
                            logger.info(f"   ⚠️ Match {api_id} found shifted to {target_date} (DB: {db_date_str}, offset: {i}d)")
                        return match_data
            
            return None # Not found within 7 days
        except Exception as e:
            logger.error(f"HTTP error while fetching match {api_id}: {e}")
            return None

    def _parse_api_payload(self, raw: dict, db_match: dict) -> dict:
        """Applies the robust parsing algorithm for Tennis.
        Normalizes the API status to avoid mismatches (e.g. 'Walk Over' vs 'Walkover').
        """
        
        # --- A. TIME (Date & Time) ---
        event_date = raw.get("event_date", "")
        event_time = raw.get("event_time", "")
        
        new_date_str = db_match.get("date_time")
        if event_date and event_time and event_time != "":
            new_date_str = f"{event_date}T{event_time}:00Z"
            
        # --- B. STATUS (with normalization) ---
        raw_status = raw.get("event_status", "")
        # API-Tennis sometimes returns numeric codes instead of text
        # "1" = Not Started, "2" = In Progress, "3" = Finished, "6" = Postponed, "7" = Cancelled
        NUMERIC_STATUS_MAP = {"1": "notstarted", "2": "live", "3": "finished", "4": "postponed",
                              "5": "cancelled", "6": "postponed", "7": "cancelled", "8": "walkover", "0": "notstarted"}
        if raw_status in NUMERIC_STATUS_MAP:
            raw_status = NUMERIC_STATUS_MAP[raw_status]
        normalized = raw_status.lower().replace(" ", "").replace("-", "")  # "Walk Over" -> "walkover"
        
        is_live = str(raw.get("event_live", "0")) == "1"
        winner = raw.get("event_winner")
        final_res = raw.get("event_final_result", "")
        
        # Compute the default status dynamically instead of blindly preserving it
        # If the match is within the next 3 hours → imminent, otherwise → scheduled
        new_status = "scheduled"
        if new_date_str:
            try:
                match_dt = datetime.fromisoformat(new_date_str.replace("Z", "+00:00"))
                hours_until = (match_dt - datetime.now(timezone.utc)).total_seconds() / 3600
                if 0 <= hours_until <= 3:
                    new_status = "imminent"
            except (ValueError, TypeError):
                pass

        # Normalized status sets for robust classification
        FINISHED_STATUSES = {"finished"}
        DECIDED_STATUSES = {"walkover", "retired", "abandoned", "cancelled", "defaulted"}
        POSTPONED_STATUSES = {"postponed", "delayed", "suspended", "interrupted"}
        LIVE_KEYWORDS = {"set", "tiebreak", "game", "live"}
        
        # Rule 1: Absolute end (normal score OR a declared winner)
        if normalized in FINISHED_STATUSES or (winner and final_res and final_res != "-"):
            new_status = "finished"
            
        # Rule 2: Match decided without a classic score (walkover, retired, etc.)
        elif normalized in DECIDED_STATUSES:
            new_status = "finished"  # Considered finished since a winner is declared
            
        # Rule 3: Winner declared (ultimate safety net)
        elif winner:
            new_status = "finished"
            logger.info(f"   🔒 Match {db_match.get('api_id')}: Winner detected ('{winner}') with API status '{raw_status}' → forced finished.")
            
        # Rule 4: Postponed / Suspended
        elif normalized in POSTPONED_STATUSES:
            new_status = "postponed"
            
        # Rule 5: Live
        elif any(kw in normalized for kw in LIVE_KEYWORDS) or is_live:
            new_status = "live"
            
        # Rule 6: Unknown status → Warning + force cancelled if the match is overdue
        elif raw_status and normalized not in {"", "notstarted", "scheduled"}:
            logger.warning(f"   ⚠️ UNRECOGNIZED API STATUS for match {db_match.get('api_id')}: '{raw_status}' (normalized: '{normalized}'). Check the status list.")
            # If the match is >6h overdue with an unknown status, force it to cancelled
            match_dt_str = db_match.get("date_time", "")
            if match_dt_str:
                try:
                    dt = datetime.fromisoformat(match_dt_str.replace("Z", "+00:00"))
                    hours_past = (datetime.now(timezone.utc) - dt).total_seconds() / 3600
                    if hours_past > 6:
                        new_status = "cancelled"
                        logger.info(f"   🔒 Match {db_match.get('api_id')}: Unknown status '{raw_status}' + >6h overdue → forced cancelled.")
                except (ValueError, TypeError):
                    pass
            
        # --- C. SCORE & SETS ---
        score = None
        if final_res and final_res != "-" and final_res != "":
            score = final_res
            
        sets_played = 0
        raw_scores = raw.get("scores", [])
        if isinstance(raw_scores, list) and len(raw_scores) > 0:
            first_set = raw_scores[0]
            if first_set.get("score_first") == "0" and first_set.get("score_second") == "0" and len(raw_scores) == 1:
                sets_played = 0
            else:
                sets_played = len(raw_scores)
                
        # NOTE: STATUS_DISPLAY values below are hardcoded French user-facing strings
        # (status_short), not code comments — same real content gap as elsewhere in
        # this file and in process_daily_matches.py. Left untouched by this English
        # sweep; flagged separately, not yet fixed.
        # Normalize status_short for a consistent frontend display
        STATUS_DISPLAY = {
            "finished": "Terminé",
            "walkover": "W.O.",
            "retired": "Abandon",
            "abandoned": "Abandon",
            "cancelled": "Annulé",
            "defaulted": "Forfait",
            "postponed": "Reporté",
            "delayed": "Retardé",
            "suspended": "Suspendu",
            "interrupted": "Interrompu",
            "notstarted": "",
            "scheduled": "",
        }
        display_status = STATUS_DISPLAY.get(normalized, raw_status)
        
        # If live, keep the raw status (e.g. "Set 2", "Tiebreak")
        if new_status == "live":
            display_status = raw_status
        
        return {
            "status": new_status,
            "status_short": display_status,
            "date_time": new_date_str,
            "score": score,
            "sets_played": sets_played
        }

    def _apply_update_if_needed(self, api_id: int, db_match: dict, parsed: dict) -> bool:
        """Compares and applies the update if values differ. Returns True if modified."""
        payload = {}
        
        if parsed["status"] != db_match.get("status"):
            payload["status"] = parsed["status"]
            
        # Safe date comparison (ignore None vs None)
        old_date = db_match.get("date_time")
        new_date = parsed["date_time"]
        if new_date and old_date and new_date[:16] != old_date[:16]:
            payload["date_time"] = new_date
            
        if parsed["score"] != db_match.get("score"):
            payload["score"] = parsed["score"]
            
        if parsed["sets_played"] != db_match.get("sets_played"):
            payload["sets_played"] = parsed["sets_played"]
            
        if not payload:
            logger.info(f"   💤 Match {api_id}: No change detected.")
            return False

        try:
            self.db.update("tennis_matches", payload, {"api_id": api_id})
            updates_str = ", ".join([f"{k}={v}" for k, v in payload.items()])
            logger.info(f"   ✅ Match {api_id} updated: {updates_str}")
        except Exception as e:
            logger.error(f"   ❌ DB error while updating {api_id}: {e}")
            return False

        self._sync_public(api_id, db_match, payload)
        return True

    def _sync_public(self, api_id: int, db_match: dict, payload: dict) -> None:
        """Mirrors a status/score/date_time change into public.matches — see
        upsert_fb_data.py's FBMatchUpserter._sync_public for the full
        explanation. Tennis's public score shape differs from football/
        basketball's (a display string + sets_played, no home/away ints —
        see tennis_client.py's _build_public_match)."""
        if self.public_db is None:
            return

        public_payload = {}
        if "status" in payload:
            public_payload["status"] = ANALYTICS_TO_PUBLIC_STATUS.get(payload["status"], payload["status"])
        if "date_time" in payload:
            public_payload["date_time"] = payload["date_time"]
        if "status_short" in payload:
            public_payload["status_short"] = payload["status_short"]
        if "score" in payload or "sets_played" in payload:
            public_payload["score"] = {
                "home": None,
                "away": None,
                "display": payload.get("score", db_match.get("score")),
                "sets_played": payload.get("sets_played", db_match.get("sets_played")),
            }

        if not public_payload:
            return

        try:
            self.public_db.update("matches", public_payload, {"api_sport_id": str(api_id), "sport": "tennis"})
        except Exception as e:
            logger.error(f"   ❌ Public sync error for tennis {api_id}: {e}")
