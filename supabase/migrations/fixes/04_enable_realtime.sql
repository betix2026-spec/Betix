-- 1. Enable replication for the public.matches table
-- This lets Supabase track changes row by row.
ALTER TABLE public.matches REPLICA IDENTITY FULL;

-- 2. Add the table to the 'supabase_realtime' publication
-- 'supabase_realtime' is the default publication listened to by Websockets.
BEGIN;
  -- Drop if already present to avoid errors on re-run
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.matches;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
COMMIT;
