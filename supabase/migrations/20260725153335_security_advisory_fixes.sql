-- ============================================================
-- BETIX -- Supabase advisory security fixes
-- Date: 2026-07-25
-- Purpose:
--   - Enable RLS on public tables flagged by Supabase advisors.
--   - Remove broad system_config write access for all authenticated users.
--   - Revoke public RPC execution from internal/security-definer helpers.
--   - Pin function search_path values.
--   - Remove broad listing policy on public storage bucket Users.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Enable RLS on exposed public tables and add intentional read policies.
-- ------------------------------------------------------------

ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_match_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Badges are viewable by everyone" ON public.badges;
CREATE POLICY "Badges are viewable by everyone"
    ON public.badges
    FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "App config is viewable by everyone" ON public.app_config;
CREATE POLICY "App config is viewable by everyone"
    ON public.app_config
    FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "AI match audits are viewable by everyone" ON public.ai_match_audits;
CREATE POLICY "AI match audits are viewable by everyone"
    ON public.ai_match_audits
    FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Admins can view system logs" ON public.system_logs;
CREATE POLICY "Admins can view system logs"
    ON public.system_logs
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE profiles.id = (SELECT auth.uid())
              AND profiles.role IN ('admin', 'super_admin')
        )
    );

-- ------------------------------------------------------------
-- 2. Tighten system_config policies.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "Allow all access for service role" ON public.system_config;
DROP POLICY IF EXISTS "Allow full access for authenticated" ON public.system_config;
DROP POLICY IF EXISTS "Admin can update system_config" ON public.system_config;
DROP POLICY IF EXISTS "Allow read access for all" ON public.system_config;
DROP POLICY IF EXISTS "Admins can insert system_config" ON public.system_config;
DROP POLICY IF EXISTS "Admins can update system_config" ON public.system_config;
DROP POLICY IF EXISTS "Admins can delete system_config" ON public.system_config;

CREATE POLICY "Allow read access for all"
    ON public.system_config
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "Admins can insert system_config"
    ON public.system_config
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE profiles.id = (SELECT auth.uid())
              AND profiles.role IN ('admin', 'super_admin')
        )
    );

CREATE POLICY "Admins can update system_config"
    ON public.system_config
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE profiles.id = (SELECT auth.uid())
              AND profiles.role IN ('admin', 'super_admin')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE profiles.id = (SELECT auth.uid())
              AND profiles.role IN ('admin', 'super_admin')
        )
    );

CREATE POLICY "Admins can delete system_config"
    ON public.system_config
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE profiles.id = (SELECT auth.uid())
              AND profiles.role IN ('admin', 'super_admin')
        )
    );

-- ------------------------------------------------------------
-- 3. Lock down public RPC execution.
-- ------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public._internal_match_sync(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._internal_match_sync(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_analytics_schema() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.maintenance_public_window() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_15_days_window() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_match_to_public(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_sync_basketball() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_sync_football() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_sync_tennis() FROM PUBLIC, anon, authenticated;

-- get_admin_users_v1 is used by the admin users page, so keep it available to
-- signed-in users but enforce authorization inside the SECURITY DEFINER body.
CREATE OR REPLACE FUNCTION public.get_admin_users_v1()
RETURNS TABLE (
    id uuid,
    username text,
    email text,
    role text,
    plan_id text,
    avatar_url text,
    created_at timestamptz,
    last_active timestamptz,
    status text,
    favorite_sport text,
    total_predictions integer,
    win_rate double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE profiles.id = (SELECT auth.uid())
          AND profiles.role IN ('admin', 'super_admin')
    ) THEN
        RAISE EXCEPTION 'admin access required' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        p.id,
        p.username,
        u.email::text,
        p.role,
        s.plan_id::text,
        p.avatar_url,
        p.created_at,
        u.last_sign_in_at AS last_active,
        COALESCE(s.status, 'inactive')::text AS status,
        CASE
            WHEN p.favorite_sports IS NOT NULL AND array_length(p.favorite_sports, 1) > 0
            THEN p.favorite_sports[1]::text
            ELSE 'Unknown'::text
        END AS favorite_sport,
        COALESCE(st.total_bets, 0)::integer AS total_predictions,
        COALESCE(st.win_rate, 0.0)::double precision AS win_rate
    FROM public.profiles p
    JOIN auth.users u ON p.id = u.id
    LEFT JOIN public.subscriptions s ON p.id = s.user_id
    LEFT JOIN public.user_stats st ON p.id = st.user_id
    WHERE p.deleted_at IS NULL
    ORDER BY p.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_users_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_users_v1() TO authenticated;

-- ------------------------------------------------------------
-- 4. Pin search_path on advisor-flagged functions.
-- ------------------------------------------------------------

ALTER FUNCTION public._internal_match_sync(uuid, text) SET search_path = public, analytics;
ALTER FUNCTION public._internal_match_sync(text, text) SET search_path = public, analytics;
ALTER FUNCTION public.get_analytics_schema() SET search_path = public, information_schema;
ALTER FUNCTION public.handle_new_user() SET search_path = public, auth;
ALTER FUNCTION public.maintenance_public_window() SET search_path = public, analytics;
ALTER FUNCTION public.sync_15_days_window() SET search_path = public, analytics;
ALTER FUNCTION public.sync_match_to_public(text, text) SET search_path = public;
ALTER FUNCTION public.trigger_sync_basketball() SET search_path = public;
ALTER FUNCTION public.trigger_sync_football() SET search_path = public;
ALTER FUNCTION public.trigger_sync_tennis() SET search_path = public;

-- ------------------------------------------------------------
-- 5. Remove public object listing for the public Users bucket.
-- Public buckets can still serve objects by public URL without this policy.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
