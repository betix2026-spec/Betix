"""
BETIX — batch_audit.py
Proactive AI generation via Anthropic's Message Batches API (50% cheaper
than the regular Messages API) — used for the ~24h-out initial pass over
the 3 top-tier football leagues (see tier_scope.py). Submit and poll are
separate steps because a batch can take up to ~1h (rarely, up to 24h) to
finish, so this can't block the 30-minute scheduled pass the way the old
synchronous ensure_audit() call did.

Two entry points, both called from scripts/updates/scheduled_audit_pass.py:
    submit_pending_batch(db, targets) -> Optional[str]   (batch_id or None)
    poll_and_ingest_batches(db) -> dict                  (counts, for logging)

The ~1h-before-kickoff delta pass is NOT batched — it runs too close to
kickoff for a job that can (rarely) take up to 24h to land in time, and
it's already capped at one extra synchronous call per top-tier match (see
audit_orchestration.ensure_delta_audit). Batching only pays off for the
high-volume, non-urgent initial pass.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from anthropic import AsyncAnthropic
from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
from anthropic.types.messages.batch_create_params import Request

from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST
from app.engine.prompt_builder import build_audit_prompt
from app.engine.data_aggregation import get_match_raw_context
from app.engine.confidence_generator import (
    DEFAULT_MODEL,
    AI_CONFIG,
    parse_ai_response,
    normalize_outcome_fields,
    normalize_language_fields,
    validate_analysis,
)
from scripts.updates.match_audit_script import filter_essential_stats, LIVE_RUN_ID

logger = logging.getLogger("betix.batch_audit")


def _client() -> AsyncAnthropic:
    settings = get_settings()
    return AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)


async def submit_pending_batch(db: SupabaseREST, targets: List[Tuple[str, int]]) -> Optional[str]:
    """
    Builds a prompt + archival context for each (sport, match_id) target and
    submits them as a single Anthropic Message Batch. Locks every match to
    'pending' BEFORE submitting (same pattern as match_audit_script.run_audit)
    so nothing else — a second scheduled pass, an on-demand request — tries
    to regenerate the same match while the batch is in flight.

    No `temperature`/`top_p`/`top_k` on the batch requests: the production
    model (Sonnet 5) rejects `temperature` outright, and ai_model.py's
    interactive retry-without-it fallback has no equivalent in a batch
    context (a rejected request just comes back 'errored' per-custom_id,
    it can't be silently retried mid-batch) — so this sends the config
    already known to work rather than the one known to fail.

    Returns the batch's provider id, or None if there was nothing to submit.
    """
    if not targets:
        return None

    requests: List[Request] = []
    tracking: List[Dict[str, Any]] = []
    lock_rows: List[Dict[str, Any]] = []
    now_iso = datetime.now(timezone.utc).isoformat()

    for sport, match_id in targets:
        try:
            system_prompt, user_prompt, ceiling = await build_audit_prompt(sport, match_id)
            raw_context = await get_match_raw_context(sport, match_id)
            if not raw_context or not raw_context.get("match"):
                raise RuntimeError("empty raw context")
        except Exception as e:
            logger.error(f"batch_audit: skipping {sport}#{match_id} — context/prompt build failed: {e}")
            continue

        essential_stats = filter_essential_stats(sport, raw_context)
        odds_ctx = raw_context.get("odds", {}) or {}
        snapshots = [m.get("snapshot_at") for m in odds_ctx.values() if m.get("snapshot_at")]
        snapshot_at = max(snapshots) if snapshots else None

        custom_id = f"{sport}:{match_id}"
        requests.append(Request(
            custom_id=custom_id,
            params=MessageCreateParamsNonStreaming(
                model=DEFAULT_MODEL,
                max_tokens=AI_CONFIG["max_tokens"],
                # Every request in a batch submission is for the same
                # sport, so system_prompt is byte-identical across all of
                # them (see prompt_builder.SPORT_PROMPTS) — cache_control
                # here means only the first request in the batch actually
                # pays full price for it; the rest read from cache.
                system=[{
                    "type": "text",
                    "text": system_prompt,
                    "cache_control": {"type": "ephemeral"},
                }],
                messages=[{"role": "user", "content": user_prompt}],
            ),
        ))
        tracking.append({
            "custom_id": custom_id,
            "sport": sport,
            "match_id": match_id,
            "ceiling": ceiling,
            "odds": raw_context.get("odds"),
            "h2h": raw_context.get("h2h"),
            "rolling_stats": essential_stats,
            "injuries": raw_context.get("injuries"),
            "snapshot_at": snapshot_at,
        })
        lock_rows.append({
            "match_id": match_id,
            "sport": sport,
            "run_id": LIVE_RUN_ID,
            "status": "pending",
            "attempted_at": now_iso,
        })

    if not requests:
        return None

    db.upsert("ai_match_audits", lock_rows, on_conflict="match_id,sport,run_id")

    client = _client()
    batch = await client.messages.batches.create(requests=requests)
    logger.info(f"batch_audit: submitted batch {batch.id} with {len(requests)} request(s).")

    db.upsert(
        "ai_audit_batches",
        [{
            "provider": "claude",
            "provider_batch_id": batch.id,
            "status": "submitted",
            "request_count": len(requests),
            "requests": tracking,
            "submitted_at": now_iso,
        }],
        on_conflict="provider_batch_id",
    )
    return batch.id


async def poll_and_ingest_batches(db: SupabaseREST) -> Dict[str, int]:
    """
    Checks every not-yet-ingested batch; for each one that has finished
    ('ended'), walks its results and archives each match into
    ai_match_audits (same shape run_audit writes), then marks the batch row
    'ingested'. Safe to call repeatedly — a batch still processing is
    simply skipped until the next call.
    """
    client = _client()
    open_batches = db.select_raw("ai_audit_batches", "status=eq.submitted")

    ready, failed, still_waiting = 0, 0, 0

    for row in open_batches:
        batch_id = row["provider_batch_id"]
        try:
            batch = await client.messages.batches.retrieve(batch_id)
        except Exception as e:
            logger.error(f"batch_audit: failed to retrieve batch {batch_id}: {e}")
            continue

        if batch.processing_status != "ended":
            still_waiting += 1
            continue

        tracking_by_id = {t["custom_id"]: t for t in (row.get("requests") or [])}

        try:
            # results() is itself a coroutine that resolves to an
            # async-iterable JSONL decoder — unlike the sync client (where
            # .results() returns a plain iterator directly), the async
            # client needs the extra await before the `async for`.
            results = await client.messages.batches.results(batch_id)
            async for result in results:
                tracked = tracking_by_id.get(result.custom_id)
                if not tracked:
                    logger.warning(f"batch_audit: no tracking entry for {result.custom_id} in batch {batch_id}")
                    continue

                sport = tracked["sport"]
                match_id = tracked["match_id"]
                ceiling = tracked["ceiling"]

                if result.result.type == "succeeded":
                    msg = result.result.message
                    text = next((b.text for b in msg.content if b.type == "text"), "")
                    analysis = parse_ai_response(text)

                    if analysis:
                        analysis = normalize_outcome_fields(analysis)
                        analysis = normalize_language_fields(analysis)
                        validate_analysis(analysis, ceiling=ceiling)
                        analysis["_meta"] = {
                            "sport": sport, "match_id": match_id,
                            "provider": "claude", "model": DEFAULT_MODEL,
                        }
                        db.upsert(
                            "ai_match_audits",
                            [{
                                "match_id": match_id, "sport": sport, "run_id": LIVE_RUN_ID,
                                "status": "ready", "error_message": None,
                                "snapshot_at": tracked.get("snapshot_at"),
                                "odds": tracked.get("odds"), "h2h": tracked.get("h2h"),
                                "rolling_stats": tracked.get("rolling_stats"),
                                "injuries": tracked.get("injuries"),
                                "ai_analysis": analysis,
                                "ai_provider": "claude", "ai_model": DEFAULT_MODEL,
                            }],
                            on_conflict="match_id,sport,run_id",
                        )
                        ready += 1
                    else:
                        db.upsert(
                            "ai_match_audits",
                            [{
                                "match_id": match_id, "sport": sport, "run_id": LIVE_RUN_ID,
                                "status": "failed",
                                "error_message": "Batch result: could not parse JSON from response",
                            }],
                            on_conflict="match_id,sport,run_id",
                        )
                        failed += 1
                else:
                    error_obj = getattr(result.result, "error", None)
                    error_detail = getattr(error_obj, "message", None) or result.result.type
                    db.upsert(
                        "ai_match_audits",
                        [{
                            "match_id": match_id, "sport": sport, "run_id": LIVE_RUN_ID,
                            "status": "failed", "error_message": str(error_detail)[:500],
                        }],
                        on_conflict="match_id,sport,run_id",
                    )
                    failed += 1
        except Exception as e:
            logger.error(f"batch_audit: failed to ingest results for batch {batch_id}: {e}")
            continue

        db.upsert(
            "ai_audit_batches",
            [{
                "provider_batch_id": batch_id,
                "status": "ingested",
                "ended_at": datetime.now(timezone.utc).isoformat(),
                "ingested_at": datetime.now(timezone.utc).isoformat(),
            }],
            on_conflict="provider_batch_id",
        )

    return {"ready": ready, "failed": failed, "still_waiting": still_waiting}
