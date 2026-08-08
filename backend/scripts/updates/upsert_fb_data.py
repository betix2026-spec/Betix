import logging
from datetime import datetime, timezone
import httpx

logger = logging.getLogger("draft.fb_upsert")

class FBMatchUpserter:
    def __init__(self, db_client, api_keys: dict):
        self.db = db_client
        self.api_keys = api_keys # {"football": key1, "basketball": key2}
        
        self.endpoints = {
            "football": {"url": "https://v3.football.api-sports.io/fixtures", "id_param": "id"},
            "basketball": {"url": "https://v1.basketball.api-sports.io/games", "id_param": "id"}
        }
        
        # Shared HTTP client (reused across calls)
        self._http_client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Returns a shared HTTP client, creating it if needed."""
        if self._http_client is None or self._http_client.is_closed:
            self._http_client = httpx.AsyncClient(timeout=15.0)
        return self._http_client

    async def close(self):
        """Cleanly closes the HTTP client."""
        if self._http_client and not self._http_client.is_closed:
            await self._http_client.aclose()
            self._http_client = None

    async def process_match(self, sport: str, db_match: dict) -> bool:
        """
        Processes a Football or Basketball match: Fetch API -> Parse -> Diff -> Update DB.
        Returns True if the processed match is considered 'finished', False otherwise.
        """
        api_id = db_match["api_id"]
        
        raw = await self._fetch_api_data(sport, api_id)
        if not raw:
            logger.warning(f"   ⚠️ Match {sport} {api_id} not found on the API.")
            return db_match["status"] == "finished"
            
        parsed_data = self._parse_api_payload(sport, raw, db_match)
        
        self._apply_update_if_needed(sport, api_id, db_match, parsed_data)
        
        return parsed_data["status"] == "finished"

    async def _fetch_api_data(self, sport: str, api_id: int) -> dict | None:
        config = self.endpoints.get(sport)
        if not config: return None
        
        headers = {"x-apisports-key": self.api_keys.get(sport)}
        params = {config["id_param"]: api_id}
        
        try:
            client = await self._get_client()
            resp = await client.get(config["url"], headers=headers, params=params)
            resp.raise_for_status()
            data = resp.json().get("response", [])
            
            if data:
                return data[0]
            return None
        except Exception as e:
            logger.error(f"HTTP error ({sport}) while fetching {api_id}: {e}")
            return None

    def _parse_api_payload(self, sport: str, raw: dict, db_match: dict) -> dict:
        date_time = None
        short_status = None
        home_score = None
        away_score = None
        time_display = None
        
        if sport == "football":
            fixture = raw.get("fixture", {})
            date_time = fixture.get("date")
            short_status = fixture.get("status", {}).get("short", "")
            elapsed = fixture.get("status", {}).get("elapsed")
            if elapsed:
                time_display = f"{elapsed}'"
            elif short_status:
                time_display = short_status
                
            goals = raw.get("goals", {})
            home_score = goals.get("home") if goals else None
            away_score = goals.get("away") if goals else None
        elif sport == "basketball":
            date_time = raw.get("date")
            short_status = raw.get("status", {}).get("short", "")
            time_display = short_status
            scores = raw.get("scores", {})
            home_score = scores.get("home", {}).get("total") if scores.get("home") else None
            away_score = scores.get("away", {}).get("total") if scores.get("away") else None
            
        new_status = self._normalize_status(sport, short_status, db_match.get("status"), date_time or db_match.get("date_time"))
        
        # Clear status_short when the match is postponed/cancelled
        if new_status == "postponed":
            time_display = "Postponed"
        
        # Reset score if the match is postponed (avoid showing a stale score)
        if new_status == "postponed":
            home_score = None
            away_score = None
        
        # Fall back to the pre-existing values if parsing fails
        if not date_time: date_time = db_match.get("date_time")
        
        return {
            "status": new_status,
            "status_short": time_display,
            "date_time": date_time,
            "home_score": home_score,
            "away_score": away_score
        }
        
    def _normalize_status(self, sport: str, short_status: str, current_db_status: str, date_time_str: str = None) -> str:
        """Mapped API short status to our DB status"""
        FT_FOOTBALL = ["FT", "AET", "PEN"]
        FT_BASKET = ["FT", "AOT"]

        if sport == "football" and short_status in FT_FOOTBALL: return "finished"
        if sport == "basketball" and short_status in FT_BASKET: return "finished"

        # Added POST, SUSP, INT to the postponed statuses
        if short_status in ["PST", "POST", "CANC", "ABD", "AWD", "WO", "SUSP", "INT"]: return "postponed"

        if short_status in ["NS", "TBD"]:
            # Dynamically compute whether the match is imminent (within 3h)
            if date_time_str:
                try:
                    dt = datetime.fromisoformat(date_time_str.replace("Z", "+00:00"))
                    hours_until = (dt - datetime.now(timezone.utc)).total_seconds() / 3600
                    if 0 <= hours_until <= 3:
                        return "imminent"
                except (ValueError, TypeError):
                    pass
            return "scheduled"

        return "live"

    def _apply_update_if_needed(self, sport: str, api_id: int, db_match: dict, parsed: dict) -> bool:
        payload = {}
        
        if parsed["status"] != db_match.get("status"):
            payload["status"] = parsed["status"]
            
        old_date = db_match.get("date_time")
        new_date = parsed["date_time"]
        if new_date and old_date and new_date[:16] != old_date[:16]:
            payload["date_time"] = new_date
            
        if parsed["home_score"] != db_match.get("home_score") and parsed["home_score"] is not None:
            payload["home_score"] = parsed["home_score"]
        
        # Allow resetting the score to None if the match is postponed
        if parsed["status"] == "postponed" and db_match.get("home_score") is not None:
            payload["home_score"] = 0
            payload["away_score"] = 0
            
        if parsed["away_score"] != db_match.get("away_score") and parsed["away_score"] is not None:
            payload["away_score"] = parsed["away_score"]
            
        if parsed.get("status_short") != db_match.get("status_short") and parsed.get("status_short") is not None:
            payload["status_short"] = parsed["status_short"]
            
        if not payload:
            logger.info(f"   💤 Match {sport} {api_id}: No change detected.")
            return False
            
        try:
            self.db.update(f"{sport}_matches", payload, {"api_id": api_id})
            updates_str = ", ".join([f"{k}={v}" for k, v in payload.items()])
            logger.info(f"   ✅ Match {sport} {api_id} updated: {updates_str}")
            return True
        except Exception as e:
            logger.error(f"   ❌ DB error while updating {sport} {api_id}: {e}")
            return False
