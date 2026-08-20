"""
BETIX -- config_reader.py
Lecteur de configuration dynamique depuis la table system_config.
Utilise par les orchestrateurs pour lire leurs parametres a chaud.

Usage:
    from app.services.config_reader import ConfigReader

    reader = ConfigReader()
    value = reader.get("orch_ai.enabled", default="true")
    config = reader.get_prefix("orch_ai.")  # dict de toutes les cles orch_ai.*
"""

import logging
from typing import Optional

from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST

logger = logging.getLogger("betix.config_reader")


class ConfigReader:
    """Lit les parametres depuis public.system_config via PostgREST."""

    def __init__(self, db: Optional[SupabaseREST] = None):
        if db:
            self._db = db
        else:
            settings = get_settings()
            self._db = SupabaseREST(
                settings.SUPABASE_URL,
                settings.SUPABASE_SERVICE_ROLE_KEY,
                schema="public",
            )

    def get_all(self) -> dict[str, str]:
        """Charge toute la table system_config en un dict {key: value}."""
        try:
            rows = self._db.select("system_config", "key,value")
            return {row["key"]: row["value"] for row in rows}
        except Exception as e:
            logger.error(f"Impossible de lire system_config : {e}")
            return {}

    def get_prefix(self, prefix: str) -> dict[str, str]:
        """Charge toutes les cles commencant par `prefix`."""
        all_cfg = self.get_all()
        return {k: v for k, v in all_cfg.items() if k.startswith(prefix)}

    def get(self, key: str, default: str = "") -> str:
        """Lit une cle individuelle. Retourne `default` si absente."""
        try:
            rows = self._db.select("system_config", "value", filters={"key": key})
            if rows:
                return rows[0]["value"]
        except Exception as e:
            logger.warning(f"Erreur lecture system_config[{key}] : {e}")
        return default

    def get_int(self, key: str, default: int = 0) -> int:
        """Lit une cle et la convertit en int."""
        val = self.get(key, str(default))
        try:
            return int(val)
        except (ValueError, TypeError):
            return default

    def get_bool(self, key: str, default: bool = True) -> bool:
        """Lit une cle et la convertit en bool."""
        val = self.get(key, str(default).lower())
        return val.lower() in ("true", "1", "yes")

