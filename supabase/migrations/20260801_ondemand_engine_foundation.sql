-- ============================================================
-- BETIX — Foundation for the on-demand generation engine
-- Date: 2026-08-01
-- Description:
--   1. Adds a status (pending/ready/failed) on ai_match_audits to act as a
--      concurrency lock: only one AI call in flight per match at a time,
--      whether the trigger is the proactive batch (~24h before kickoff) or
--      a user click.
--   2. A new generation pass now writes under run_id = 'live' and updates
--      the existing row (UPSERT) instead of creating a new one every time —
--      a single "current" analysis per match. The old dated rows
--      (run_id = 'YYYY-MM-DD_runN') are left intact as history from the
--      previous system; nothing is deleted here.
-- ============================================================

-- 1. Status column
ALTER TABLE public.ai_match_audits
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ready'
        CHECK (status IN ('pending', 'ready', 'failed'));

-- 2. Timestamp of the last attempt (used to detect a stuck 'pending' — e.g.
--    the process died before it could mark ready/failed — and allow it to be resumed)
ALTER TABLE public.ai_match_audits
    ADD COLUMN IF NOT EXISTS attempted_at TIMESTAMPTZ;

-- 3. Optional error message when status = 'failed'
ALTER TABLE public.ai_match_audits
    ADD COLUMN IF NOT EXISTS error_message TEXT;

-- 4. Index for the scheduler's and the on-demand fallback's queries
CREATE INDEX IF NOT EXISTS idx_match_audits_status ON public.ai_match_audits(status);

COMMENT ON COLUMN public.ai_match_audits.status IS
    'pending = generation in progress (duplicate-prevention lock); ready = analysis available; failed = last attempt failed, can be retried.';
COMMENT ON COLUMN public.ai_match_audits.attempted_at IS
    'Timestamp of the last transition to pending. Used to detect a stuck lock (dead process) and let it expire.';
