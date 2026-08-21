"""
BETIX — scheduled_audit_pass.py
Lightweight scheduled pass, two stages per top-tier match:
  1. INITIAL — generates an analysis ONCE, within ~24h of kickoff, if it
     doesn't already have a fresh one. Football (the 3-league top-tier
     scope, see tier_scope.py) goes through the Anthropic Message Batches
     API (batch_audit.py) — 50% cheaper, and this is the highest-volume
     sport. Basketball and tennis stay on the direct synchronous path
     below — lower volume, not worth the added submit/poll complexity.
  2. DELTA — a second, deliberate call ~1h before kickoff that re-checks
     fresher data (odds/injuries/referee) against the initial analysis and
     confirms or updates it (see audit_orchestration.ensure_delta_audit).
     Always synchronous for every sport — a batch job can (rarely) take up
     to 24h, which is too slow this close to kickoff.
This caps every top-tier match at exactly 2 AI calls. Replaces the old
batch (orchestrator_ai.py / batch_audit_next_days.py) which re-analyzed
every match up to 16 times over a rolling 3-day window, and the interim
system (an 18h staleness check) which produced a second call accidentally,
around 6h before kickoff, with no new signal driving it.

Matches outside top-tier scope, or not yet reached by this pass, never get
a *proactive* analysis — they can still get one on demand (routers/audits.py),
subject to the per-user rate limit (see app/actions/match.ts).

Runs every 30 minutes via APScheduler (see app/main.py).

KNOWN LIMITATION (tennis): the current schema has no tour/gender column on
tennis_tournaments — there's no way to distinguish ATP/WTA in the database
yet. The "men only" filter is therefore NOT applied below; only the
category filter (grand_slam/masters_1000/atp_500) is. Adding that column
(and populating it at ingestion time) is a prerequisite for enforcing the
full scope as decided.
"""

import logging
import sys
import os
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Tuple

# Path setup so this also works run directly (python scripts/updates/scheduled_audit_pass.py),
# not just imported from within the running app (which already has the
# project root on sys.path via how uvicorn starts it).
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST
from app.engine.audit_orchestration import (
    ensure_audit,
    ensure_delta_audit,
    STALE_AFTER_HOURS,
    PENDING_LOCK_TIMEOUT_MINUTES,
)
from app.engine.batch_audit import submit_pending_batch, poll_and_ingest_batches
from app.engine.tier_scope import (
    is_football_top_tier,
    is_basketball_top_tier,
    is_tennis_top_tier,
)
from scripts.updates.match_audit_script import LIVE_RUN_ID

logger = logging.getLogger("betix.scheduled_audit_pass")

LOOKAHEAD_HOURS = 24
DELTA_LOOKAHEAD_HOURS = 1

SPORT_TABLES = {"football": "football_matches", "basketball": "basketball_matches"}
SPORT_TIER_FNS = {"football": is_football_top_tier, "basketball": is_basketball_top_tier}


def _window_str(hours_ahead: float) -> Tuple[str, str]:
    now = datetime.now(timezone.utc)
    window_end = now + timedelta(hours=hours_ahead)
    # 'Z' suffix instead of .isoformat()'s '+00:00' — a literal '+' in a URL
    # query string decodes as a space, corrupting the filter (400 Bad
    # Request). Same fix as used elsewhere in this codebase (e.g.
    # update_match_rolling.py, backfill_public_matches.py).
    return now.strftime("%Y-%m-%dT%H:%M:%SZ"), window_end.strftime("%Y-%m-%dT%H:%M:%SZ")


async def _eligible_by_league(db: SupabaseREST, table: str, is_top_tier_fn, window_hours: float) -> List[int]:
    now_str, window_end_str = _window_str(window_hours)
    rows = db.select_raw(
        table,
        "select=id,league:league_id(api_id)"
        f"&date_time=gte.{now_str}"
        f"&date_time=lte.{window_end_str}"
        "&status=eq.scheduled",
    )
    eligible = []
    for r in rows:
        league_api_id = (r.get("league") or {}).get("api_id")
        if is_top_tier_fn(league_api_id):
            eligible.append(r["id"])
    return eligible


async def _eligible_tennis(db: SupabaseREST, window_hours: float) -> List[int]:
    now_str, window_end_str = _window_str(window_hours)
    rows = db.select_raw(
        "tennis_matches",
        "select=id,tournament:tournament_id(category)"
        f"&date_time=gte.{now_str}"
        f"&date_time=lte.{window_end_str}"
        "&status=eq.scheduled",
    )
    eligible = []
    for r in rows:
        category = (r.get("tournament") or {}).get("category")
        # tour="ATP" is forced here since there's no such data in the DB yet — see KNOWN LIMITATION above.
        if is_tennis_top_tier(category, tour="ATP"):
            eligible.append(r["id"])
    return eligible


async def _eligible_football_targets(db_analytics: SupabaseREST, window_hours: float) -> List[Tuple[str, int]]:
    """Football only — the Batch API submission scope (see batch_audit.py)."""
    ids = await _eligible_by_league(db_analytics, "football_matches", is_football_top_tier, window_hours)
    return [("football", mid) for mid in ids]


async def _eligible_non_football_targets(db_analytics: SupabaseREST, window_hours: float) -> List[Tuple[str, int]]:
    """Basketball + tennis — stay on the direct synchronous generation path."""
    basketball_ids = await _eligible_by_league(db_analytics, "basketball_matches", is_basketball_top_tier, window_hours)
    tennis_ids = await _eligible_tennis(db_analytics, window_hours)
    return (
        [("basketball", mid) for mid in basketball_ids]
        + [("tennis", mid) for mid in tennis_ids]
    )


async def _all_eligible_targets(db_analytics: SupabaseREST, window_hours: float) -> List[Tuple[str, int]]:
    """All sports — used by the delta pass (stage 2), which is always synchronous."""
    football = await _eligible_football_targets(db_analytics, window_hours)
    rest = await _eligible_non_football_targets(db_analytics, window_hours)
    return football + rest


def _parse_ts(value: Optional[str]):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None


async def _needs_generation(db_public: SupabaseREST, targets: List[Tuple[str, int]]) -> List[Tuple[str, int]]:
    """
    Filters targets down to those that actually need a new generation —
    no existing 'live' row, a 'failed' one, a stale 'ready' one, or an
    expired 'pending' lock — the same staleness rules audit_orchestration.
    ensure_audit applies per-match, done here as one batched query so the
    Batch API submission path (submit_pending_batch) doesn't resubmit
    matches it already has a fresh or in-flight analysis for.
    """
    if not targets:
        return []
    match_ids = sorted({mid for _, mid in targets})
    rows = db_public.select_raw(
        "ai_match_audits",
        f"select=match_id,sport,status,attempted_at&run_id=eq.{LIVE_RUN_ID}&match_id=in.({','.join(map(str, match_ids))})",
    )
    by_key = {(r["sport"], r["match_id"]): r for r in rows}

    now = datetime.now(timezone.utc)
    needs: List[Tuple[str, int]] = []
    for sport, match_id in targets:
        existing = by_key.get((sport, match_id))
        if not existing:
            needs.append((sport, match_id))
            continue
        status = existing.get("status")
        ts = _parse_ts(existing.get("attempted_at"))
        if status == "ready":
            if not ts or now - ts > timedelta(hours=STALE_AFTER_HOURS):
                needs.append((sport, match_id))
        elif status == "pending":
            if not ts or now - ts > timedelta(minutes=PENDING_LOCK_TIMEOUT_MINUTES):
                needs.append((sport, match_id))
        else:  # 'failed' or an unrecognized status
            needs.append((sport, match_id))
    return needs


async def run_scheduled_pass() -> dict:
    """Entry point called by APScheduler (see app/main.py)."""
    settings = get_settings()
    db_analytics = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="analytics")
    db_public = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="public")

    # --- Stage 1a: football initial generation, ~24h out — via Batch API ---
    football_targets = await _eligible_football_targets(db_analytics, LOOKAHEAD_HOURS)
    football_needing_generation = await _needs_generation(db_public, football_targets)
    batch_id = None
    if football_needing_generation:
        try:
            batch_id = await submit_pending_batch(db_public, football_needing_generation)
        except Exception as e:
            logger.error(f"Scheduled pass: batch submission failed: {e}")
    logger.info(
        f"Scheduled pass: {len(football_targets)} football matches within {LOOKAHEAD_HOURS}h, "
        f"{len(football_needing_generation)} needed generation"
        + (f" (submitted batch {batch_id})" if batch_id else " (nothing new to submit)") + "."
    )

    # Ingest any previously-submitted batch that has finished — independent
    # of what was just submitted above, since a batch can take a while.
    try:
        batch_results = await poll_and_ingest_batches(db_public)
    except Exception as e:
        batch_results = {"ready": 0, "failed": 0, "still_waiting": 0}
        logger.error(f"Scheduled pass: batch polling failed: {e}")
    logger.info(
        f"Scheduled pass: batch poll — {batch_results['ready']} ingested ready, "
        f"{batch_results['failed']} ingested failed, {batch_results['still_waiting']} batch(es) still processing."
    )

    # --- Stage 1b: basketball + tennis initial generation, ~24h out — direct ---
    non_football_targets = await _eligible_non_football_targets(db_analytics, LOOKAHEAD_HOURS)
    logger.info(f"Scheduled pass: {len(non_football_targets)} basketball/tennis matches within {LOOKAHEAD_HOURS}h (initial).")

    ready, errors = 0, 0
    for sport, match_id in non_football_targets:
        try:
            # ensure_audit is a no-op (read-only, no AI call) if a fresh
            # analysis already exists — this is what makes the pass
            # idempotent between runs instead of regenerating in a loop.
            result = await ensure_audit(db_public, sport, match_id, generate_inline=True)
            if result["state"] == "ready":
                ready += 1
        except Exception as e:
            errors += 1
            logger.error(f"Scheduled pass error (initial) {sport}#{match_id}: {e}")

    # --- Stage 2: delta, ~1h out — the deliberate second (and last) call, every sport, always synchronous ---
    delta_targets = await _all_eligible_targets(db_analytics, DELTA_LOOKAHEAD_HOURS)
    logger.info(f"Scheduled pass: {len(delta_targets)} top-tier matches within {DELTA_LOOKAHEAD_HOURS}h (delta).")

    delta_ready, delta_errors = 0, 0
    for sport, match_id in delta_targets:
        try:
            # ensure_delta_audit is idempotent too (no-op once a delta
            # already exists for this match's live analysis).
            result = await ensure_delta_audit(db_public, sport, match_id)
            if result["state"] == "ready":
                delta_ready += 1
        except Exception as e:
            delta_errors += 1
            logger.error(f"Scheduled pass error (delta) {sport}#{match_id}: {e}")

    logger.info(
        f"Scheduled pass done: football batch {len(football_needing_generation)} submitted / "
        f"{batch_results['ready']} ingested, non-football initial {ready}/{len(non_football_targets)} ready "
        f"({errors} errors), delta {delta_ready}/{len(delta_targets)} ready ({delta_errors} errors)."
    )
    return {
        "football_batch_submitted": len(football_needing_generation),
        "football_batch_ingested_ready": batch_results["ready"],
        "football_batch_ingested_failed": batch_results["failed"],
        "non_football_scanned": len(non_football_targets),
        "ready": ready,
        "errors": errors,
        "delta_scanned": len(delta_targets),
        "delta_ready": delta_ready,
        "delta_errors": delta_errors,
    }


if __name__ == "__main__":
    import asyncio

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    asyncio.run(run_scheduled_pass())
