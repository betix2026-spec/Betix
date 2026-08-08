"""
BETIX — Matches Router
Endpoints for fetching today's matches by sport.
Returns mock data for Phase 1 (before real API integration).
"""

from fastapi import APIRouter, Query
from typing import Optional
from app.models.schemas import Sport, Match

router = APIRouter()


# =============================================================================
# MOCK DATA — Will be replaced by real API-Sports data in Phase 3
# =============================================================================

MOCK_MATCHES: list[dict] = [
    # --- FOOTBALL ---
    {
        "id": "fb-001",
        "external_id": "1035001",
        "sport": "football",
        "league": {
            "id": 39,
            "name": "Premier League",
            "logo": "https://media.api-sports.io/football/leagues/39.png",
            "country": "England",
            "country_flag": "https://media.api-sports.io/flags/gb.svg",
        },
        "home": {"id": 33, "name": "Manchester United", "logo": "https://media.api-sports.io/football/teams/33.png"},
        "away": {"id": 40, "name": "Liverpool", "logo": "https://media.api-sports.io/football/teams/40.png"},
        "date": "2026-02-11T17:30:00+00:00",
        "timestamp": 1739295000,
        "status": "scheduled",
        "score": None,
    },
    {
        "id": "fb-002",
        "external_id": "1035002",
        "sport": "football",
        "league": {
            "id": 140,
            "name": "La Liga",
            "logo": "https://media.api-sports.io/football/leagues/140.png",
            "country": "Spain",
            "country_flag": "https://media.api-sports.io/flags/es.svg",
        },
        "home": {"id": 529, "name": "FC Barcelona", "logo": "https://media.api-sports.io/football/teams/529.png"},
        "away": {"id": 541, "name": "Real Madrid", "logo": "https://media.api-sports.io/football/teams/541.png"},
        "date": "2026-02-11T20:00:00+00:00",
        "timestamp": 1739304000,
        "status": "scheduled",
        "score": None,
    },
    {
        "id": "fb-003",
        "external_id": "1035003",
        "sport": "football",
        "league": {
            "id": 61,
            "name": "Ligue 1",
            "logo": "https://media.api-sports.io/football/leagues/61.png",
            "country": "France",
            "country_flag": "https://media.api-sports.io/flags/fr.svg",
        },
        "home": {"id": 85, "name": "Paris Saint-Germain", "logo": "https://media.api-sports.io/football/teams/85.png"},
        "away": {"id": 81, "name": "Olympique de Marseille", "logo": "https://media.api-sports.io/football/teams/81.png"},
        "date": "2026-02-11T20:45:00+00:00",
        "timestamp": 1739306700,
        "status": "scheduled",
        "score": None,
    },

    # --- BASKETBALL ---
    {
        "id": "bk-001",
        "external_id": "3045001",
        "sport": "basketball",
        "league": {
            "id": 12,
            "name": "NBA",
            "logo": "https://media.api-sports.io/basketball/leagues/12.png",
            "country": "USA",
            "country_flag": "https://media.api-sports.io/flags/us.svg",
        },
        "home": {"id": 139, "name": "Los Angeles Lakers", "logo": "https://media.api-sports.io/basketball/teams/139.png"},
        "away": {"id": 134, "name": "Boston Celtics", "logo": "https://media.api-sports.io/basketball/teams/134.png"},
        "date": "2026-02-11T19:30:00+00:00",
        "timestamp": 1739302200,
        "status": "scheduled",
        "score": None,
    },
    {
        "id": "bk-002",
        "external_id": "3045002",
        "sport": "basketball",
        "league": {
            "id": 12,
            "name": "NBA",
            "logo": "https://media.api-sports.io/basketball/leagues/12.png",
            "country": "USA",
            "country_flag": "https://media.api-sports.io/flags/us.svg",
        },
        "home": {"id": 137, "name": "Golden State Warriors", "logo": "https://media.api-sports.io/basketball/teams/137.png"},
        "away": {"id": 138, "name": "Milwaukee Bucks", "logo": "https://media.api-sports.io/basketball/teams/138.png"},
        "date": "2026-02-11T22:00:00+00:00",
        "timestamp": 1739311200,
        "status": "scheduled",
        "score": None,
    },

    # --- TENNIS ---
    {
        "id": "tn-001",
        "external_id": "5067001",
        "sport": "tennis",
        "league": {
            "id": 1,
            "name": "ATP Tour — Australian Open",
            "logo": "",
            "country": "Australia",
            "country_flag": "🇦🇺",
        },
        "home": {"id": 1001, "name": "Carlos Alcaraz", "logo": ""},
        "away": {"id": 1002, "name": "Jannik Sinner", "logo": ""},
        "date": "2026-02-11T09:00:00+00:00",
        "timestamp": 1739264400,
        "status": "scheduled",
        "score": None,
    },
    {
        "id": "tn-002",
        "external_id": "5067002",
        "sport": "tennis",
        "league": {
            "id": 2,
            "name": "WTA Tour — Australian Open",
            "logo": "",
            "country": "Australia",
            "country_flag": "🇦🇺",
        },
        "home": {"id": 2001, "name": "Iga Swiatek", "logo": ""},
        "away": {"id": 2002, "name": "Aryna Sabalenka", "logo": ""},
        "date": "2026-02-11T11:00:00+00:00",
        "timestamp": 1739271600,
        "status": "scheduled",
        "score": None,
    },
]


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("/today")
async def get_today_matches(
    sport: Optional[Sport] = Query(None, description="Filter by sport"),
):
    """Fetches today's matches, optionally filtered by sport."""
    matches = MOCK_MATCHES

    if sport:
        matches = [m for m in matches if m["sport"] == sport.value]

    return {
        "count": len(matches),
        "matches": matches,
    }


@router.post("/refresh")
async def refresh_live_matches():
    """Triggers a forced sync of live matches."""
    from app.services.ingestion.orchestrator import IngestionOrchestrator
    orchestrator = IngestionOrchestrator()
    report = await orchestrator.run_live_sync()
    
    if report.get("errors"):
        return {"status": "partial_success", "report": report}
    return {"status": "success", "report": report}



@router.get("/debug-db")
async def debug_db_content():
    """Debug endpoint to see what the backend sees in the DB."""
    from app.services.ingestion.base_client import SupabaseREST
    from app.config import get_settings
    settings = get_settings()
    
    public = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema='public')
    analytics = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema='analytics')
    
    try:
        p_live = public.select('matches', filters={'status': 'live'})
        f_live = analytics.select('football_matches', filters={'status': 'live'})
        b_live = analytics.select('basketball_matches', filters={'status': 'live'})
        
        return {
            "public_live": p_live,
            "football_live": f_live,
            "basketball_live": b_live
        }
    except Exception as e:
        return {"error": str(e)}

@router.get("/{match_id}")
async def get_match(match_id: str):
    """Fetches a single match's details by its ID."""
    match = next((m for m in MOCK_MATCHES if m["id"] == match_id), None)

    if not match:
        return {"error": "Match not found"}

    return match

