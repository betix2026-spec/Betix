-- ============================================================
-- BETIX — Migration: Stripe → Mollie
-- Date: 2026-02-27
-- Description: Replaces all Stripe references with Mollie
--               across the plans, subscriptions and profiles tables.
-- ============================================================

-- 1. PLANS: Rename stripe_price_id → mollie_plan_id
ALTER TABLE public.plans RENAME COLUMN stripe_price_id TO mollie_plan_id;

-- 2. SUBSCRIPTIONS: Rename stripe_subscription_id → mollie_subscription_id
ALTER TABLE public.subscriptions RENAME COLUMN stripe_subscription_id TO mollie_subscription_id;

-- 3. SUBSCRIPTIONS: Update the source constraint (stripe → mollie)
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_source_check;
ALTER TABLE public.subscriptions ALTER COLUMN source SET DEFAULT 'mollie';
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_source_check
    CHECK (source IN ('mollie', 'manual_gift'));

-- 4. SUBSCRIPTIONS: Add the 'trialing' status (for potential free trials)
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check
    CHECK (status IN ('active', 'past_due', 'canceled', 'trialing', 'suspended'));

-- 5. PROFILES: Add the column for the Mollie customer
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mollie_customer_id text;

-- ============================================================
-- END OF MIGRATION
-- ============================================================
