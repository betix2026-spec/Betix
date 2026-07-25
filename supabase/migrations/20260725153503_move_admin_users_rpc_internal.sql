-- ============================================================
-- BETIX -- Move admin users definer RPC out of exposed public schema
-- Date: 2026-07-25
-- Purpose:
--   Supabase advisors warn when an exposed public SECURITY DEFINER function
--   can be executed by signed-in users. Keep the public RPC name used by the
--   admin page, but make it SECURITY INVOKER and delegate to a non-exposed
--   internal SECURITY DEFINER function with the same admin guard.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS internal;

REVOKE ALL ON SCHEMA internal FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA internal TO authenticated;

CREATE OR REPLACE FUNCTION internal.get_admin_users_v1_data()
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

REVOKE EXECUTE ON FUNCTION internal.get_admin_users_v1_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION internal.get_admin_users_v1_data() TO authenticated;

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
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, internal
AS $$
    SELECT *
    FROM internal.get_admin_users_v1_data();
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_users_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_users_v1() TO authenticated;
