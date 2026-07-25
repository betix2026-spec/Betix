-- BETIX — Subscription cancellation metadata
-- Adds explicit cancellation state so paid users keep access until period end.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS estimated_refund_amount numeric(8,2);

CREATE INDEX IF NOT EXISTS idx_subscriptions_cancel_at_period_end
  ON public.subscriptions (cancel_at_period_end)
  WHERE cancel_at_period_end = true;
