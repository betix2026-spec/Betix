-- BETIX — Trial abuse prevention
-- Tracks whether a user has ever started a Stripe trial, so cancel/resubscribe
-- loops can no longer grant a fresh free trial each time.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS has_used_trial boolean NOT NULL DEFAULT false;
