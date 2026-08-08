-- 08_add_stadium_and_reset.sql
-- Add the stadium field and empty the match tables for a full re-import.
-- EXECUTED BY THE USER ON 2026-02-14.

ALTER TABLE analytics.football_matches ADD COLUMN IF NOT EXISTS stadium text;
ALTER TABLE analytics.basketball_matches ADD COLUMN IF NOT EXISTS stadium text;

TRUNCATE TABLE analytics.football_match_stats CASCADE;
TRUNCATE TABLE analytics.basketball_match_stats CASCADE;
TRUNCATE TABLE analytics.football_matches CASCADE;
TRUNCATE TABLE analytics.basketball_matches CASCADE;
