"""
BETIX — match_audit_script.py
Orchestrator script for a full match audit:
1. Data aggregation (DataAggregator)
2. Filtering essential stats
3. Analysis generation (ConfidenceGenerator)
4. Archiving to public.ai_match_audits
"""

import asyncio
import copy
import json
import logging
import argparse
import sys
import os
from datetime import datetime, timezone
from typing import Dict, Any, Optional

# Path setup so this also works run directly (python scripts/updates/match_audit_script.py),
# not just imported from within the running app (which already has the
# project root on sys.path via how uvicorn starts it).
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.engine.confidence_generator import generate_confidence, generate_delta_confidence, DEFAULT_MODEL
from app.engine.delta_gate import has_material_change
from app.services.ingestion.base_client import SupabaseREST
from app.config import get_settings

# A single "current" row per match: new generation passes write under this
# fixed run_id and overwrite the existing row (UPSERT), instead of
# accumulating a new dated row on every pass like the old system did.
# The old historical rows (run_id = 'YYYY-MM-DD_runN') are left untouched.
LIVE_RUN_ID = "live"

# Logging configuration
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("betix.audit_script")

def _latest_rolling_snapshot(sport: str, context: Dict[str, Any], side: str, keys: list) -> Dict[str, Any]:
    if sport == "tennis":
        side_key = "player1" if side == "home" else "player2"
        raw_form = context.get("rolling", {}).get(side_key, {}).get("overall", [])
    else:
        raw_form = context.get("form", {}).get(side, {}).get("global", [])

    if not raw_form:
        return {}
    latest = raw_form[0]  # Most recent
    result = {k: latest.get(k) for k in keys if k in latest}
    result["date"] = latest.get("date")
    return result


# Headline subset only — keeps the ai_match_audits.rolling_stats JSON lean.
# See DISPLAY_KEYS_BY_SPORT below for the fuller set used by the Preview
# tab, which has no storage-size concern (nothing gets persisted from it).
ESSENTIAL_KEYS_BY_SPORT = {
    "basketball": ["l5_ortg", "l5_drtg", "l5_net_rtg", "l5_pace", "l5_efg_pct", "l10_ortg", "l10_drtg"],
    "football": ["l5_goals_for", "l5_goals_against", "l5_xg_for", "l5_xg_against", "l5_possession_avg", "l5_points"],
    "tennis": ["l10_aces_avg", "l10_first_serve_pct", "l10_first_serve_won", "l10_bp_saved_pct", "l10_return_won_pct", "l10_bp_converted_pct"],
}

# The full field set already fetched and already fed to the AI prompt (see
# data_aggregation.py's _format_team_form / _format_tennis_player) — just
# never previously exposed to the read-only /stats endpoint, which is why
# the Preview tab looked sparse: it was rendering the AI-archival subset,
# not what's actually collected.
DISPLAY_KEYS_BY_SPORT = {
    "basketball": [
        "l5_ortg", "l5_drtg", "l5_net_rtg", "l5_pace", "l5_efg_pct", "l5_tov_pct", "l5_orb_pct",
        "l5_ftr", "l5_3pt_pct", "l5_win_rate", "l5_avg_margin", "l5_streak",
        "l10_ortg", "l10_drtg", "l10_net_rtg", "season_ortg", "season_drtg",
        "rest_days", "is_b2b", "games_in_7_days",
    ],
    "football": [
        "l5_goals_for", "l5_goals_against", "l5_xg_for", "l5_xg_against", "l5_xg_diff",
        "l5_possession_avg", "l5_points", "l5_ppm", "l5_win_rate", "l5_btts_rate", "l5_over25_rate",
        "l5_shots_avg", "l5_corners_avg", "l5_cards_avg", "l5_clean_sheets", "l5_pass_accuracy", "l5_streak",
    ],
    "tennis": [
        "l10_aces_avg", "l10_first_serve_pct", "l10_first_serve_won", "l10_bp_saved_pct",
        "l10_return_won_pct", "l10_bp_converted_pct", "l5_win_pct", "l10_win_pct", "season_win_pct",
        "days_since_last_match", "fatigue_score", "sets_played_l7", "minutes_played_l7",
    ],
}


def filter_essential_stats(sport: str, context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Filters the context down to the 'headline' stats only, to keep the
    ai_match_audits.rolling_stats JSON archive lean while preserving the
    substance of the audit.
    """
    keys = ESSENTIAL_KEYS_BY_SPORT.get(sport, [])
    return {side: _latest_rolling_snapshot(sport, context, side, keys) for side in ("home", "away")}


def filter_display_stats(sport: str, context: Dict[str, Any]) -> Dict[str, Any]:
    """
    The fuller field set for the Preview tab's read-only /stats endpoint —
    everything already fetched and already used in the AI prompt, just not
    trimmed down for archival size the way filter_essential_stats is.
    """
    keys = DISPLAY_KEYS_BY_SPORT.get(sport, [])
    return {side: _latest_rolling_snapshot(sport, context, side, keys) for side in ("home", "away")}

async def run_audit(
    sport: str,
    match_id: int,
    provider: str = "claude",
    model_name: Optional[str] = None,
    run_id: str = LIVE_RUN_ID,
    db: Optional[SupabaseREST] = None,
):
    """Runs the full audit flow and archives the result.

    Writes a 'pending' lock before starting the AI generation, then 'ready'
    (with the full result) or 'failed' (with the error message) — this is
    the status the on-demand endpoint and the scheduled pass use to avoid
    launching two generations in parallel for the same match.

    Args:
        sport: "football", "basketball", or "tennis"
        match_id: internal match ID
        provider: AI provider
        model_name: specific model (default: DEFAULT_MODEL, Haiku)
        run_id: 'live' by default — a single current row per match, overwritten
                on every new generation. Pass an explicit dated run_id to
                archive a separate historical snapshot (rare, legacy case).
        db: Supabase client to reuse (optional — creates one otherwise).
    """
    settings = get_settings()
    db = db or SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
    model_name = model_name or DEFAULT_MODEL

    logger.info(f"Starting audit for {sport} #{match_id} (run: {run_id})...")

    # 0. Lock: mark 'pending' BEFORE the (slow, costly) AI call, so a second
    #    concurrent trigger (a user click + the scheduled pass, or two
    #    clicks) sees the 'pending' state and doesn't start a second one.
    db.upsert(
        "ai_match_audits",
        [{
            "match_id": match_id,
            "sport": sport,
            "run_id": run_id,
            "status": "pending",
            "attempted_at": datetime.now(timezone.utc).isoformat(),
        }],
        on_conflict="match_id,sport,run_id",
    )

    try:
        # 1. Full context aggregation (raw dict for archiving and filtering)
        from app.engine.data_aggregation import get_match_raw_context
        context = await get_match_raw_context(sport, match_id)
        if not context or not context.get("match"):
            raise RuntimeError(f"Could not retrieve raw context for {sport} #{match_id}.")

        # 2. Filter essential stats for the audit
        essential_stats = filter_essential_stats(sport, context)
        logger.info(f"Essential stats extracted for {sport} (Home: {list(essential_stats['home'].keys())})")

        # 3. AI analysis generation (passing the already-aggregated context)
        analysis = await generate_confidence(
            sport=sport,
            match_id=match_id,
            provider=provider,
            model_name=model_name,
            context=context
        )

        if not analysis:
            raise RuntimeError("AI analysis generation failed.")

        # 4. Archive to public.ai_match_audits
        odds_ctx = context.get("odds", {}) or {}
        snapshots = [m.get("snapshot_at") for m in odds_ctx.values() if m.get("snapshot_at")]
        latest_snapshot = max(snapshots) if snapshots else None

        audit_data = {
            "match_id": match_id,
            "sport": sport,
            "run_id": run_id,
            "status": "ready",
            "error_message": None,
            "snapshot_at": latest_snapshot,
            "odds": context.get("odds"),
            "h2h": context.get("h2h"),
            "rolling_stats": essential_stats,
            # Snapshot at generation time — the delta pass's deterministic
            # pre-filter (app/engine/delta_gate.py) diffs against this.
            "injuries": context.get("injuries"),
            "ai_analysis": analysis,
            "ai_provider": provider,
            "ai_model": model_name,
        }

        db.upsert("ai_match_audits", [audit_data], on_conflict="match_id,sport,run_id")
        logger.info(f"Audit archived successfully (run: {run_id}).")
        return True

    except Exception as e:
        logger.error(f"Audit failed for {sport} #{match_id}: {e}")
        db.upsert(
            "ai_match_audits",
            [{
                "match_id": match_id,
                "sport": sport,
                "run_id": run_id,
                "status": "failed",
                "error_message": str(e)[:500],
            }],
            on_conflict="match_id,sport,run_id",
        )
        raise


def _carry_forward_unchanged(previous_analysis: Dict[str, Any]) -> Dict[str, Any]:
    """The shared "nothing changed" result for run_delta_audit — a full
    copy of the original analysis (never re-emitted by the model) with
    `changed: False`, used whether the deterministic pre-filter skipped the
    AI call entirely or the model itself confirmed nothing needed updating."""
    result = copy.deepcopy(previous_analysis)
    result["changed"] = False
    result.pop("change_summary", None)
    return result


async def run_delta_audit(
    sport: str,
    match_id: int,
    provider: str = "claude",
    model_name: Optional[str] = None,
    run_id: str = LIVE_RUN_ID,
    db: Optional[SupabaseREST] = None,
):
    """Runs the ~1h-before-kickoff delta pass and writes ONLY the delta_*
    columns — never touches ai_analysis/status/attempted_at, so the
    original ~24h-out analysis is preserved alongside it (see
    audit_orchestration.ensure_delta_audit, the only caller).

    Requires an existing 'ready' row for this match (the base analysis to
    delta against) — raises if there isn't one; the caller is expected to
    have already checked this.
    """
    settings = get_settings()
    db = db or SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
    model_name = model_name or DEFAULT_MODEL

    logger.info(f"Starting delta audit for {sport} #{match_id} (run: {run_id})...")

    existing_rows = db.select_raw(
        "ai_match_audits",
        f"match_id=eq.{match_id}&sport=eq.{sport}&run_id=eq.{run_id}&limit=1",
    )
    existing = existing_rows[0] if existing_rows else None
    if not existing or existing.get("status") != "ready" or not existing.get("ai_analysis"):
        raise RuntimeError(f"No ready base analysis to delta against for {sport} #{match_id}.")

    previous_analysis = existing["ai_analysis"]
    if isinstance(previous_analysis, str):
        previous_analysis = json.loads(previous_analysis)

    # Lock: mark delta 'pending' before the AI call, same pattern as run_audit.
    db.upsert(
        "ai_match_audits",
        [{
            "match_id": match_id,
            "sport": sport,
            "run_id": run_id,
            "delta_status": "pending",
            "delta_attempted_at": datetime.now(timezone.utc).isoformat(),
        }],
        on_conflict="match_id,sport,run_id",
    )

    try:
        from app.engine.data_aggregation import get_match_raw_context
        context = await get_match_raw_context(sport, match_id)
        if not context or not context.get("match"):
            raise RuntimeError(f"Could not retrieve raw context for {sport} #{match_id}.")

        fresh_essential_stats = filter_essential_stats(sport, context)

        if has_material_change(existing, context, fresh_essential_stats, sport):
            result = await generate_delta_confidence(
                sport=sport,
                match_id=match_id,
                previous_analysis=previous_analysis,
                provider=provider,
                model_name=model_name,
                context=context,
            )
            if not result:
                raise RuntimeError("AI delta analysis generation failed.")
            # The model itself may still conclude nothing needed changing —
            # generate_delta_confidence returns the minimal {"changed":
            # False} in that case (no picks to carry). Either way, what
            # lands in delta_analysis should be the *complete* shape (same
            # as generate_confidence's output, plus changed/change_summary)
            # so nothing downstream has to special-case a bare flag.
            delta_analysis = result if result.get("changed") else _carry_forward_unchanged(previous_analysis)
        else:
            # Deterministic pre-filter found nothing material — no AI call
            # at all. Carry the original analysis forward untouched rather
            # than re-emitting it, so there's zero risk of translation
            # drift on the fields that didn't need to change.
            logger.info(f"Delta for {sport} #{match_id}: pre-filter found no material change, skipping AI call.")
            delta_analysis = _carry_forward_unchanged(previous_analysis)

        db.upsert(
            "ai_match_audits",
            [{
                "match_id": match_id,
                "sport": sport,
                "run_id": run_id,
                "delta_status": "ready",
                "delta_error_message": None,
                "delta_analysis": delta_analysis,
                "delta_generated_at": datetime.now(timezone.utc).isoformat(),
            }],
            on_conflict="match_id,sport,run_id",
        )
        logger.info(f"Delta audit archived successfully (run: {run_id}).")
        return True

    except Exception as e:
        logger.error(f"Delta audit failed for {sport} #{match_id}: {e}")
        db.upsert(
            "ai_match_audits",
            [{
                "match_id": match_id,
                "sport": sport,
                "run_id": run_id,
                "delta_status": "failed",
                "delta_error_message": str(e)[:500],
            }],
            on_conflict="match_id,sport,run_id",
        )
        raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="BETIX -- Single match AI audit")
    parser.add_argument("sport", choices=["football", "basketball", "tennis"])
    parser.add_argument("match_id", type=int)
    parser.add_argument("--provider", default="claude", choices=["gemini", "gpt", "claude"])
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--run-id", default=LIVE_RUN_ID, help="Run identifier (default: 'live' — overwrites the current row)")

    args = parser.parse_args()

    asyncio.run(run_audit(args.sport, args.match_id, args.provider, args.model, args.run_id))
