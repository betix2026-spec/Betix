-- ============================================================
-- BETIX — Add the "No Subscription" plan
-- Date: 2026-02-27
-- Description: Creates a dedicated plan used to restrict
--               access to the dashboard.
-- ============================================================

INSERT INTO public.plans (id, name, price, features) 
VALUES (
    'no_subscription', 
    'Aucun Abonnement Actif', 
    0.00, 
    '[]'::jsonb
)
ON CONFLICT (id) DO UPDATE 
SET name = EXCLUDED.name, features = EXCLUDED.features;

-- Note: This plan acts as a marker for the Paywall.
-- Users with this plan (or no subscription) will be redirected to /pricing.
