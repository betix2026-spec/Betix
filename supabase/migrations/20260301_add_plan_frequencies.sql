-- ============================================================
-- BETIX — Migration: Add subscription frequencies
-- Date: 2026-03-01
-- Description: Adds the quarterly and semi_annual frequencies
--               to the plans table.
-- ============================================================

-- 1. Drop the old frequency constraint if it exists
ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS plans_frequency_check;

-- 2. Add the new constraint with all frequencies
ALTER TABLE public.plans ADD CONSTRAINT plans_frequency_check
    CHECK (frequency IN ('free', 'daily', 'weekly', 'monthly', 'quarterly', 'semi_annual', 'yearly'));

-- ============================================================
-- END OF MIGRATION
-- ============================================================
