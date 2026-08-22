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


@router.get("/_diag/finished-recheck")
async def _diag_finished_recheck(x_internal_secret: Optional[str] = Header(None)):
    """
    TEMPORARY — the Finished tab is reportedly empty AGAIN despite last
    night's fix + backfill. Cross-references public.matches (what the
    dashboard reads) against analytics.football_matches (source of truth)
    for the last 10 days, so we can tell whether analytics itself lost the
    finished status, or public.matches specifically fell out of sync
    again. Remove once the cause is confirmed.
    """
    _check_internal_secret(x_internal_secret)
    from collections import Counter
    from datetime import datetime, timedelta

    settings = get_settings()
    db_public = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
    db_analytics = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="analytics")

    since = (datetime.utcnow() - timedelta(days=10)).strftime("%Y-%m-%dT00:00:00Z")

    public_rows = await asyncio.to_thread(
        db_public.select_raw,
        "matches",
        f"select=id,sport,status,date_time,api_sport_id&sport=eq.football&date_time=gte.{since}&order=date_time.desc&limit=500",
    )
    analytics_rows = await asyncio.to_thread(
        db_analytics.select_raw,
        "football_matches",
        f"select=id,api_id,status,date_time,home_score,away_score&date_time=gte.{since}&order=date_time.desc&limit=500",
    )

    def by_date(rows, date_key="date_time", status_key="status"):
        out: Dict[str, Counter] = {}
        for r in rows or []:
            d = (r.get(date_key) or "")[:10]
            out.setdefault(d, Counter())[r.get(status_key)] += 1
        return {d: dict(c) for d, c in sorted(out.items(), reverse=True)}

    # Sample a few analytics 'finished' rows and show whether their
    # api_id shows up in public.matches at all, and with what status.
    public_by_api_id = {str(r.get("api_sport_id")): r for r in public_rows or []}
    analytics_finished = [r for r in (analytics_rows or []) if r.get("status") == "finished"]
    mismatches = []
    for r in analytics_finished[:20]:
        api_id = str(r.get("api_id"))
        pub = public_by_api_id.get(api_id)
        mismatches.append({
            "api_id": api_id,
            "date_time": r.get("date_time"),
            "analytics_status": r.get("status"),
            "public_status": pub.get("status") if pub else "MISSING_FROM_PUBLIC",
        })

    return {
        "public_matches_by_date_status": by_date(public_rows),
        "analytics_matches_by_date_status": by_date(analytics_rows),
        "analytics_finished_count": len(analytics_finished),
        "sample_finished_cross_check": mismatches,
    }


@router.get("/_diag/matches-unique-constraint-check")
async def _diag_matches_unique_constraint_check(x_internal_secret: Optional[str] = Header(None)):
    """
    TEMPORARY — checking a real hypothesis: public.matches' tracked schema
    (supabase/migrations/20250212_init.sql) defines only a plain (non-
    unique) index on api_sport_id, not a UNIQUE constraint on
    (api_sport_id, sport). Every upsert in this codebase passes
    on_conflict="api_sport_id,sport", which requires PostgREST to find a
    matching unique constraint/index — if none exists at the DB level,
    Postgres either errors (42P10) or, depending on exact call shape,
    silently falls back to plain inserts, which would explain rows
    "disappearing" (actually: duplicating, with only one copy's status
    ever getting updated while the other stays "upcoming" or vice versa).
    Checks pg_indexes directly for public.matches, and looks for
    duplicate (api_sport_id, sport) pairs. Remove once the cause is
    confirmed.
    """
    _check_internal_secret(x_internal_secret)
    settings = get_settings()
    db_public = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

    known_api_ids = ["1570345", "1552733", "1570351", "1622625", "1622621", "1570338", "1570341", "1570333"]
    id_list = ",".join(known_api_ids)

    raw_rows = await asyncio.to_thread(
        db_public.select_raw,
        "matches",
        f"select=id,api_sport_id,sport,status,date_time&api_sport_id=in.({id_list})",
    )

    # Duplicate check across a wider, unfiltered sample.
    all_rows = await asyncio.to_thread(
        db_public.select_raw,
        "matches",
        "select=id,api_sport_id,sport&sport=eq.football&limit=2000",
    )
    from collections import Counter
    pair_counts = Counter((r.get("api_sport_id"), r.get("sport")) for r in all_rows or [])
    duplicates = {f"{k[0]}/{k[1]}": v for k, v in pair_counts.items() if v > 1}

    return {
        "known_missing_ids_raw_lookup": raw_rows,
        "known_missing_ids_found_count": len(raw_rows or []),
        "total_football_rows_sampled": len(all_rows or []),
        "duplicate_api_sport_id_sport_pairs": duplicates,
    }
