-- BETIX — Plan badge translations
-- badge_text ("POPULAIRE", "RENTABLE", etc.) was single-language, same gap
-- as name/description before. Additive only, falls back to badge_text.

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS badge_text_en text,
  ADD COLUMN IF NOT EXISTS badge_text_es text,
  ADD COLUMN IF NOT EXISTS badge_text_de text;
