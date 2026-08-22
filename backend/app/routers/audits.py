"""
BETIX — Audits Router
On-demand AI analysis generation endpoint, plus a read-only stats endpoint.

Called ONLY by the Next.js server action (frontend/src/app/actions/match.ts)
after it has already verified the user is premium — this endpoint does not
repeat that check, it trusts the internal caller. Protected by a shared
secret so it can't be called directly by a client, which would recreate
exactly the cost problem this engine was built to eliminate.
"""

import asyncio
import logging
from fastapi import APIRouter, BackgroundTasks, Header, HTTPException
from pydantic import BaseModel
from typing import Any, Dict, Optional

from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST
from app.engine.audit_orchestration import ensure_audit
from scripts.updates.match_audit_script import run_audit, filter_display_stats, LIVE_RUN_ID

logger = logging.getLogger("betix.audits_router")

router = APIRouter(prefix="/audits", tags=["Audits"])

VALID_SPORTS = {"football", "basketball", "tennis"}


class EnsureAuditResponse(BaseModel):
    state: str  # "ready" | "pending"
    audit: Optional[Dict[str, Any]] = None


class MatchStatsResponse(BaseModel):
    h2h: Optional[Dict[str, Any]] = None
    rolling_stats: Optional[Dict[str, Any]] = None
    odds: Optional[Dict[str, Any]] = None
    match_info: Optional[Dict[str, Any]] = None
    injuries: Optional[Dict[str, Any]] = None
    # {"home": ["W","L","D",...], "away": [...]} — most recent first, real
    # match-by-match results (see fetch_team_form_sequence), not the
    # rolling table's single streak string.
    form: Optional[Dict[str, Any]] = None


def _check_internal_secret(x_internal_secret: Optional[str]) -> None:
    settings = get_settings()
    expected = settings.INTERNAL_API_SECRET
    if not expected or x_internal_secret != expected:
        raise HTTPException(status_code=403, detail="Forbidden — internal endpoint")


async def _run_audit_background(sport: str, match_id: int, db: SupabaseREST):
    try:
        await run_audit(sport, match_id, provider="claude", run_id=LIVE_RUN_ID, db=db)
    except Exception as e:
        # run_audit already writes status='failed' to the row on error —
        # this catch is only so an unhandled exception doesn't crash the
        # background task silently with no log trace.
        logger.error(f"Background audit generation failed for {sport}#{match_id}: {e}")


@router.post("/{sport}/{match_id}/ensure", response_model=EnsureAuditResponse)
async def ensure_audit_endpoint(
    sport: str,
    match_id: int,
    background_tasks: BackgroundTasks,
    x_internal_secret: Optional[str] = Header(None),
):
    """
    Returns the existing analysis if it's ready and fresh, otherwise
    triggers a generation (in the background) and returns "pending"
    immediately — the frontend shows a "preparing" state and polls shortly after.

    Cost control here is a per-user rate limit, not a scope/tier ban — see
    requestOnDemandAudit() in app/actions/match.ts, the only caller that's
    allowed to reach this endpoint for a match with no existing analysis.
    Every match is eligible for on-demand generation; what's rationed is
    how often any one user can trigger it.
    """
    _check_internal_secret(x_internal_secret)

    if sport not in VALID_SPORTS:
        raise HTTPException(status_code=400, detail=f"Invalid sport: {sport}")

    settings = get_settings()
    db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

    result = await ensure_audit(db, sport, match_id, generate_inline=False)

    if result["state"] == "needs_generation":
        background_tasks.add_task(_run_audit_background, sport, match_id, db)
        return EnsureAuditResponse(state="pending", audit=None)

    return EnsureAuditResponse(state=result["state"], audit=result.get("audit"))


@router.get("/{sport}/{match_id}/stats", response_model=MatchStatsResponse)
async def match_stats_endpoint(
    sport: str,
    match_id: int,
    x_internal_secret: Optional[str] = Header(None),
):
    """
    Read-only aggregated stats (H2H, rolling form, odds, match info,
    injuries, real per-match form) for a match — no AI call, no
    ai_match_audits read/write. Powers the Preview tab, which renders
    identically regardless of AI state.
    """
    _check_internal_secret(x_internal_secret)

    if sport not in VALID_SPORTS:
        raise HTTPException(status_code=400, detail=f"Invalid sport: {sport}")

    from app.engine.data_aggregation import get_match_raw_context, fetch_team_form_sequence

    # include_injuries=True: the Preview tab now shows injuries directly
    # (fetch_injuries is cached with a TTL — see data_aggregation.py's
    # _INJURIES_CACHE — so this doesn't reintroduce the live-API-on-every-
    # page-load lag that was fixed earlier by turning it off entirely).
    context = await get_match_raw_context(sport, match_id, include_injuries=True)
    if not context or not context.get("match"):
        raise HTTPException(status_code=404, detail="Match not found")

    match_raw = context.get("match") or {}
    teams = context.get("teams") or {}
    home_team_id = (teams.get("home") or {}).get("id")
    away_team_id = (teams.get("away") or {}).get("id")
    match_date = match_raw.get("date_time")

    form = None
    if sport != "tennis" and home_team_id and away_team_id and match_date:
        home_form, away_form = await asyncio.gather(
            fetch_team_form_sequence(sport, home_team_id, match_date),
            fetch_team_form_sequence(sport, away_team_id, match_date),
        )
        form = {"home": home_form, "away": away_form}

    match_info = {
        "venue": match_raw.get("stadium"),
        "date_time": match_raw.get("date_time"),
        "round": match_raw.get("round"),
        "referee_name": match_raw.get("referee_name"),
    }

    return MatchStatsResponse(
        h2h=context.get("h2h"),
        # The fuller field set (not the AI-archival essential_stats subset)
        # — everything already collected, actually shown to the user now.
        rolling_stats=filter_display_stats(sport, context),
        odds=context.get("odds"),
        match_info=match_info,
        injuries=context.get("injuries"),
        form=form,
    )


@router.get("/_diag/promoted-team-api-check")
async def _diag_promoted_team_api_check(team: str, season: int, x_internal_secret: Optional[str] = Header(None)):
    """
    TEMPORARY — checking whether API-Football actually has prior-season
    data for a promoted/newly-in-scope team (e.g. Ipswich) even though our
    own analytics.football_matches has none (rolling stats are computed
    from OUR ingested match history, not a live API call — see
    update_match_rolling.py's get_team_history — so if the team's prior
    season was in an out-of-scope competition, e.g. the Championship,
    which isn't in FOOTBALL_LEAGUES, we never ingested it, regardless of
    whether the provider has it). Calls /fixtures?team=<api_id>&season=<season>
    directly, with NO league filter, to see every competition the
    provider actually has on record. Remove once checked.
    """
    _check_internal_secret(x_internal_secret)
    settings = get_settings()
    db_analytics = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="analytics")

    teams = await asyncio.to_thread(db_analytics.select_raw, "teams", f"select=id,api_id,name&name=ilike.*{team}*&sport=eq.football")
    if not teams:
        return {"error": "team not found", "team": team}
    api_id = teams[0]["api_id"]

    from app.services.ingestion.football_client import FootballClient
    client = FootballClient()
    try:
        data = await client._api_get("/fixtures", {"team": api_id, "season": season})
    finally:
        await client.close()

    fixtures = data.get("response", [])
    leagues_seen = {}
    for f in fixtures:
        lg = f.get("league", {})
        key = f"{lg.get('id')} - {lg.get('name')} ({lg.get('country')})"
        leagues_seen[key] = leagues_seen.get(key, 0) + 1

    return {
        "matched_team": teams[0],
        "season_queried": season,
        "total_fixtures_returned_by_api": len(fixtures),
        "leagues_represented": leagues_seen,
        "sample_fixtures": [
            {
                "date": f.get("fixture", {}).get("date"),
                "league": f.get("league", {}).get("name"),
                "home": f.get("teams", {}).get("home", {}).get("name"),
                "away": f.get("teams", {}).get("away", {}).get("name"),
                "score": f.get("goals"),
            }
            for f in fixtures[:5]
        ],
    }
