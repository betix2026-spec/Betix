-- ============================================================
-- BETIX — Migration: Composite Subscriptions
-- Date: 2026-03-01
-- Description: Replaces the 'promo' JSON with typed
--               trial_price and trial_days columns to
--               support Mollie launch offers.
-- ============================================================

-- 1. Add the new columns
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS trial_price numeric DEFAULT NULL;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS trial_days integer DEFAULT NULL;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS strikethrough_price numeric DEFAULT NULL;

-- 2. Migrate existing data from the promo field
UPDATE public.plans
SET trial_price = (promo->>'price')::numeric,
    trial_days = CASE
        WHEN promo->>'duration' ~ '^\d+[jJdD]?$'
            THEN (regexp_replace(promo->>'duration', '[^0-9]', '', 'g'))::integer
        ELSE NULL
    END
WHERE promo IS NOT NULL
  AND promo->>'price' IS NOT NULL
  AND (promo->>'price')::numeric > 0;

-- 3. Keep the promo column for rollback (will be dropped after validation)
-- ALTER TABLE public.plans DROP COLUMN IF EXISTS promo;

-- ============================================================
-- END OF MIGRATION
-- ============================================================
