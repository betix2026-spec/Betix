-- ============================================================
-- BETIX — Batch API proactive pass + rate-limited on-demand requests
-- Date: 2026-08-21
-- Description:
--   Replaces the per-match synchronous initial generation (~24h out) with
--   a submit-then-poll flow against Anthropic's Message Batches API (50%
--   cheaper, see backend/app/engine/batch_audit.py). ai_audit_batches
--   tracks each submitted batch job and the per-match data needed to
--   archive its result once ingested (ceiling, odds/h2h/rolling snapshot —
--   captured at submission time so ingestion doesn't need a second, now
--   possibly-stale, data fetch).
--
--   ai_ondemand_requests logs every user-triggered on-demand generation
--   (routers/audits.py, called from app/actions/match.ts) so a soft daily
--   rate limit can be enforced per user instead of the old hard
--   tier/window ban — see requestOnDemandAudit() in app/actions/match.ts.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_audit_batches (
    id BIGSERIAL PRIMARY KEY,
    provider TEXT NOT NULL DEFAULT 'claude',
    provider_batch_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'submitted'
        CHECK (status IN ('submitted', 'ingested')),
    request_count INT NOT NULL DEFAULT 0,
    -- [{custom_id, sport, match_id, ceiling, odds, h2h, rolling_stats, snapshot_at}, ...]
    -- captured at submission time so ingestion can archive each match's
    -- result without re-fetching (possibly stale) data.
    requests JSONB NOT NULL DEFAULT '[]',
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    ingested_at TIMESTAMPTZ
);

COMMENT ON TABLE public.ai_audit_batches IS
    'Tracks each Anthropic Message Batch submitted by the proactive AI pass (batch_audit.py) — submitted -> ingested once results are retrieved and archived into ai_match_audits.';

CREATE INDEX IF NOT EXISTS idx_ai_audit_batches_status ON public.ai_audit_batches (status);

CREATE TABLE IF NOT EXISTS public.ai_ondemand_requests (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    sport TEXT NOT NULL,
    match_id INT NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_ondemand_requests IS
    'One row per user-triggered on-demand AI generation (the "Generate" button on the match page). Used to enforce a rolling 24h per-user cap — see DAILY_ONDEMAND_LIMIT in app/actions/match.ts. Not a lock or a cache — purely a rate-limit log.';

CREATE INDEX IF NOT EXISTS idx_ai_ondemand_requests_user_time ON public.ai_ondemand_requests (user_id, requested_at);
