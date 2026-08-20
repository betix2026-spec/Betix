-- ============================================================
-- BETIX — Delta pass for the AI analysis engine (2-call cap)
-- Date: 2026-08-20
-- Description:
--   Adds the columns for the deliberate ~1h-before-kickoff "delta" call
--   (see scripts/updates/scheduled_audit_pass.py / audit_orchestration.
--   ensure_delta_audit). Stored separately from ai_analysis/status/
--   attempted_at so the original ~24h-out analysis is preserved alongside
--   the delta rather than overwritten — needed to show "confirmed" vs
--   "updated" in the UI, and to audit that the 2-call cap actually holds.
-- ============================================================

ALTER TABLE public.ai_match_audits
    ADD COLUMN IF NOT EXISTS delta_analysis JSONB,
    ADD COLUMN IF NOT EXISTS delta_status TEXT
        CHECK (delta_status IN ('pending', 'ready', 'failed')),
    ADD COLUMN IF NOT EXISTS delta_attempted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS delta_error_message TEXT,
    ADD COLUMN IF NOT EXISTS delta_generated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.ai_match_audits.delta_analysis IS
    'Result of the ~1h-before-kickoff delta pass — same JSON shape as ai_analysis, plus `changed` (bool) and `change_summary` when changed=true. NULL until the delta pass runs.';
COMMENT ON COLUMN public.ai_match_audits.delta_status IS
    'pending = delta generation in progress (lock); ready = delta available; failed = last delta attempt failed. NULL = delta not attempted yet.';
COMMENT ON COLUMN public.ai_match_audits.delta_attempted_at IS
    'Timestamp of the last transition to delta_status=pending.';
COMMENT ON COLUMN public.ai_match_audits.delta_generated_at IS
    'When the delta pass last successfully completed for this match''s current live analysis. Used as the idempotency guard so the ~1h scheduled pass never re-runs it.';
