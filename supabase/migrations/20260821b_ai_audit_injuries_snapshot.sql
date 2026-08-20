-- ============================================================
-- BETIX — Persist injuries snapshot for the delta pre-filter
-- Date: 2026-08-21
-- Description:
--   The ~24h-out initial analysis already fetches injuries (football only,
--   live API-Football call — see data_aggregation.py::fetch_injuries) but
--   never stored them, only used them transiently to build the prompt. The
--   new deterministic delta pre-filter (app/engine/delta_gate.py) needs a
--   baseline to diff the ~1h-fresh injuries fetch against, to decide
--   whether the delta pass can skip its AI call entirely. Without a stored
--   baseline there's nothing to compare, so the filter would always have
--   to assume "might have changed" and call the AI anyway.
-- ============================================================

ALTER TABLE public.ai_match_audits
    ADD COLUMN IF NOT EXISTS injuries JSONB;

COMMENT ON COLUMN public.ai_match_audits.injuries IS
    'Injuries snapshot ({"home": [...], "away": [...]}, pre-formatted strings) the initial ~24h-out analysis was generated from — football only, empty/null otherwise. Immutable after the initial generation (never touched by the delta pass); used as the comparison baseline by app/engine/delta_gate.py.';
