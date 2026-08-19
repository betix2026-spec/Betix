-- ============================================================
-- BETIX — Phase 3: AI prediction grading (historic accuracy tracking)
-- Date: 2026-08-09
-- Description:
--   Adds the columns needed to automatically check, once a match is
--   finished, whether each AI pick (in ai_match_audits.ai_analysis)
--   actually won — using the structured `outcome` field already produced
--   by the AI on every pick (see prompt_builder.OUTPUT_FORMAT). A
--   scheduled job (grade_predictions_pass.py) fills these in; nothing
--   here runs automatically at migration time.
-- ============================================================

-- 1. When this audit was last graded (NULL = not graded yet, or the match
--    hasn't finished). Re-run-safe: a graded row is simply skipped next pass.
ALTER TABLE public.ai_match_audits
    ADD COLUMN IF NOT EXISTS graded_at TIMESTAMPTZ;

-- 2. Per-category won/lost/push/ungraded counts, e.g.:
--    {"high_confidence": {"won": 1, "lost": 0, "push": 0, "ungraded": 0},
--     "medium_confidence": {...}, "risky": {...}}
--    Kept as counts (not full per-pick detail) since the only consumer is
--    the accuracy aggregate view — no need to duplicate the picks already
--    stored in ai_analysis.
ALTER TABLE public.ai_match_audits
    ADD COLUMN IF NOT EXISTS grading_results JSONB;

-- 3. Index for the grading pass's "find ungraded, ready audits" query.
CREATE INDEX IF NOT EXISTS idx_match_audits_ungraded
    ON public.ai_match_audits(sport, match_id)
    WHERE graded_at IS NULL AND status = 'ready';

-- 4. Index for the admin accuracy aggregate's "read all graded audits" query.
CREATE INDEX IF NOT EXISTS idx_match_audits_graded_at
    ON public.ai_match_audits(graded_at)
    WHERE graded_at IS NOT NULL;

COMMENT ON COLUMN public.ai_match_audits.graded_at IS
    'When this audit''s picks were checked against the final match result. NULL until the match finishes and the grading pass processes it.';
COMMENT ON COLUMN public.ai_match_audits.grading_results IS
    'Per-category won/lost/push/ungraded pick counts, computed from ai_analysis.categories against the final score. Powers the admin AI accuracy view.';
