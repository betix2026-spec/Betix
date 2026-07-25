-- BETIX — Plan/feature translations
-- Adds per-language columns for plan and feature text. Additive only —
-- the existing name/description/label columns remain the French source of
-- truth and the default fallback when a translation is missing.

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS name_en text,
  ADD COLUMN IF NOT EXISTS name_es text,
  ADD COLUMN IF NOT EXISTS name_de text,
  ADD COLUMN IF NOT EXISTS description_en text,
  ADD COLUMN IF NOT EXISTS description_es text,
  ADD COLUMN IF NOT EXISTS description_de text;

ALTER TABLE public.feature_definitions
  ADD COLUMN IF NOT EXISTS label_en text,
  ADD COLUMN IF NOT EXISTS label_es text,
  ADD COLUMN IF NOT EXISTS label_de text,
  ADD COLUMN IF NOT EXISTS description_en text,
  ADD COLUMN IF NOT EXISTS description_es text,
  ADD COLUMN IF NOT EXISTS description_de text;
