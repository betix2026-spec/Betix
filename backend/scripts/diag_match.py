"""
BETIX — Diagnostic script
Compare l'état d'un match entre l'API externe et la DB analytics.
Usage: python scripts/diag_match.py
"""

import asyncio
import sys
import os
import json
import httpx

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app.config import get_settings

settings = get_settings()

API_ID = 470486
SPORT = "basketball"

async def fetch_api():
    """Interroge l'API-Sports pour le match."""
    url = "https://v1.basketball.api-sports.io/games"
    headers = {"x-apisports-key": settings.API_SPORTS_KEY}
    params = {"id": API_ID}

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url, headers=headers, params=params)
        resp.raise_for_status()
        data = resp.json()
        return data

def fetch_db():
    """Interroge analytics.basketball_matches pour le match."""
    from app.services.ingestion.base_client import SupabaseREST
    db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="analytics")
    rows = db.select_raw("basketball_matches", f"select=*&api_id=eq.{API_ID}")
    return rows

def fetch_public_db():
    """Interroge public.matches pour le match."""
    from app.services.ingestion.base_client import SupabaseREST
    db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="public")
    rows = db.select_raw("matches", f"select=*&api_sport_id=eq.{API_ID}&sport=eq.{SPORT}")
    return rows

async def main():
    print("=" * 60)
    print(f"DIAGNOSTIC MATCH {SPORT.upper()} — API ID: {API_ID}")
    print("=" * 60)

    # 1. API
    print("\n--- 1. REPONSE API-SPORTS ---")
    try:
        api_data = await fetch_api()
        results = api_data.get("results", 0)
        print(f"Nombre de résultats: {results}")
        if api_data.get("response"):
            match = api_data["response"][0]
            status = match.get("status", {})
            scores = match.get("scores", {})
            teams = match.get("teams", {})
            print(f"Date: {match.get('date')}")
            print(f"Status long: {status.get('long')}")
            print(f"Status short: {status.get('short')}")
            print(f"Timer: {status.get('timer')}")
            print(f"Home: {teams.get('home', {}).get('name')} — Score: {scores.get('home', {}).get('total')}")
            print(f"Away: {teams.get('away', {}).get('name')} — Score: {scores.get('away', {}).get('total')}")
            print(f"\nRAW scores: {json.dumps(scores, indent=2)}")
        else:
            print("Aucun résultat retourné par l'API!")
            print(f"Errors: {api_data.get('errors')}")
    except Exception as e:
        print(f"ERREUR API: {e}")

    # 2. Analytics DB
    print("\n--- 2. ANALYTICS DB (basketball_matches) ---")
    try:
        db_rows = fetch_db()
        if db_rows:
            row = db_rows[0]
            print(f"ID interne: {row.get('id')}")
            print(f"API ID: {row.get('api_id')}")
            print(f"Date: {row.get('date_time')}")
            print(f"Status: {row.get('status')}")
            print(f"Status short: {row.get('status_short')}")
            print(f"Home score: {row.get('home_score')}")
            print(f"Away score: {row.get('away_score')}")
            print(f"Home team ID: {row.get('home_team_id')}")
            print(f"Away team ID: {row.get('away_team_id')}")
        else:
            print("MATCH NON TROUVE dans analytics.basketball_matches!")
    except Exception as e:
        print(f"ERREUR DB: {e}")

    # 3. Public DB
    print("\n--- 3. PUBLIC DB (matches) ---")
    try:
        pub_rows = fetch_public_db()
        if pub_rows:
            row = pub_rows[0]
            print(f"ID: {row.get('id')}")
            print(f"API Sport ID: {row.get('api_sport_id')}")
            print(f"Sport: {row.get('sport')}")
            print(f"Status: {row.get('status')}")
            print(f"Status short: {row.get('status_short')}")
            print(f"Score: {json.dumps(row.get('score'), indent=2)}")
            print(f"Date: {row.get('date_time')}")
        else:
            print("MATCH NON TROUVE dans public.matches!")
    except Exception as e:
        print(f"ERREUR DB: {e}")

    print("\n" + "=" * 60)

asyncio.run(main())
