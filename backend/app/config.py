"""
BETIX Backend — Configuration
Loads environment variables and exposes the global config.
"""

import os
from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """BETIX application configuration."""

    # --- App ---
    APP_NAME: str = "BETIX API"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = True

    # --- CORS ---
    FRONTEND_URL: str = "http://localhost:3000"

    # --- API-Sports (Football + Basketball) ---
    API_SPORTS_KEY: str = ""
    API_FOOTBALL_BASE_URL: str = "https://v3.football.api-sports.io"
    API_BASKETBALL_BASE_URL: str = "https://v1.basketball.api-sports.io"

    # --- API-Tennis ---
    API_TENNIS_KEY: str = ""
    API_TENNIS_BASE_URL: str = "https://api.api-tennis.com/tennis/"

    # --- Gemini (IA) ---
    GEMINI_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""

    # --- Supabase ---
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""

    # --- OpenWeatherMap ---
    OPENWEATHER_KEY: str = ""

    # --- Stripe ---
    STRIPE_SECRET_KEY: str = ""

    # --- Ingestion ---
    CURRENT_SEASON: int = 2024

    # --- Internal service secret (protects endpoints called only by the
    # server-side frontend, e.g. the on-demand AI generation trigger) ---
    INTERNAL_API_SECRET: str = ""

    # --- Supabase webhook secret (protects endpoints called only by a
    # Supabase Database Webhook, e.g. the new-user -> EmailOctopus sync) ---
    SUPABASE_WEBHOOK_SECRET: str = ""

    # --- EmailOctopus ---
    EMAILOCTOPUS_API_KEY: str = ""
    EMAILOCTOPUS_LIST_ID: str = ""

    model_config = {
        # Loads the .env relative to this file (backend/.env)
        "env_file": os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"),
        "env_file_encoding": "utf-8",
        "case_sensitive": True,
        "extra": "ignore",
    }


@lru_cache()
def get_settings() -> Settings:
    """Returns the singleton settings instance."""
    return Settings()
