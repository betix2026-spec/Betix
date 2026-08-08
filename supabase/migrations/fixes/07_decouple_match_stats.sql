-- -----------------------------------------------------------------------------
-- Script: 07_decouple_match_stats.sql
-- Description: Empty the stats tables and drop the FK constraint on match_id
-- since we're now using the API ID directly as match_id.
-- -----------------------------------------------------------------------------

-- 1. Empty the tables (RESET)
TRUNCATE TABLE analytics.football_match_stats;
TRUNCATE TABLE analytics.basketball_match_stats;

-- 2. Drop the foreign key constraints pointing to *_matches(id)
-- Football
ALTER TABLE analytics.football_match_stats
DROP CONSTRAINT IF EXISTS football_match_stats_match_id_fkey;

-- Basketball
ALTER TABLE analytics.basketball_match_stats
DROP CONSTRAINT IF EXISTS basketball_match_stats_match_id_fkey;

-- Note: We keep the FK on team_id since teams still exist in the DB.
