-- BETIX — Notification translations
-- notifications.title/message were single-language (whatever the admin typed),
-- rendered raw to every recipient regardless of their site language. Same gap
-- as plans/features before. Additive only, falls back to title/message.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS title_en text,
  ADD COLUMN IF NOT EXISTS title_es text,
  ADD COLUMN IF NOT EXISTS title_de text,
  ADD COLUMN IF NOT EXISTS message_en text,
  ADD COLUMN IF NOT EXISTS message_es text,
  ADD COLUMN IF NOT EXISTS message_de text;
