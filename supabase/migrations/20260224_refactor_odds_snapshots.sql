-- ============================================================
-- Migration: Refactoring analytics.odds_snapshots
-- Date: 2026-02-24
-- Description: Switch to an EAV / JSONB structure to
--               support all market types.
-- ============================================================

-- 1. Drop the old table (and its indexes)
-- Note: We know the table is currently empty in production
DROP TABLE IF EXISTS analytics.odds_snapshots;

-- 2. Create the new, highly flexible table
CREATE TABLE analytics.odds_snapshots (
    id              bigserial PRIMARY KEY,
    match_id        int NOT NULL,
    sport           text NOT NULL CHECK (sport IN ('football', 'basketball', 'tennis')),
    bookmaker       text NOT NULL,
    snapshot_at     timestamptz NOT NULL DEFAULT now(),
    
    -- Dynamic structure
    market_name     text NOT NULL,  -- E.g.: '1x2', 'Over/Under', 'Both Teams To Score'
    market_value    text,           -- E.g.: '2.5' (for Over/Under), NULL by default
    
    -- Format attendu: [{"label": "Home", "odds": 1.50}, {"label": "Draw", "odds": 3.40}]
    odds_data       jsonb NOT NULL
);

-- 3. Create optimized indexes
CREATE INDEX idx_odds_sport_match ON analytics.odds_snapshots(sport, match_id);
CREATE INDEX idx_odds_snapshot_time ON analytics.odds_snapshots(snapshot_at DESC);
CREATE INDEX idx_odds_market ON analytics.odds_snapshots(market_name);
