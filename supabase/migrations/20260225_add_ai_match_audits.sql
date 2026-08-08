-- ============================================================
-- BETIX — Add the AI analysis audit table
-- Date: 2026-02-25
-- Description: Stores the full context and result of the AI
--               for each analyzed match.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_match_audits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id INT NOT NULL, -- Internal ID from the analytics.*_matches table
    sport TEXT NOT NULL CHECK (sport IN ('football', 'basketball', 'tennis')),
    snapshot_at TIMESTAMPTZ, -- Date of the Bet365 snapshot used
    odds JSONB,             -- Odds used during the analysis
    h2h JSONB,              -- Head-to-Head data
    rolling_stats JSONB,    -- Rolling form stats
    ai_analysis JSONB,      -- The raw JSON returned by the AI
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Only one audit per match for now (UPSERT possible)
    UNIQUE(match_id, sport)
);

-- Index for fast lookups
CREATE INDEX idx_match_audits_match_id ON public.ai_match_audits(match_id);
CREATE INDEX idx_match_audits_sport ON public.ai_match_audits(sport);
CREATE INDEX idx_match_audits_created ON public.ai_match_audits(created_at DESC);

-- Table comment
COMMENT ON TABLE public.ai_match_audits IS 'Archive table storing the full context and result of analyses produced by the AI engine.';
