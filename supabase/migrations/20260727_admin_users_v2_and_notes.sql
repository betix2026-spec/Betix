-- BETIX — Admin users list: pagination, filters, sorting, real per-user notes
-- get_admin_users_v1() fetched every user in one call with no way to filter,
-- sort, or page — fine at low row counts, a real scaling problem as the user
-- base grows. This adds a v2 RPC with search/role/status/plan filters, sort,
-- limit/offset, and a total_count column for pagination. Also adds a
-- p_user_id short-circuit so the admin notifications inbox can deep-link to
-- one user's profile without loading the whole list.
--
-- Follows the same internal/public split as
-- 20260725153503_move_admin_users_rpc_internal.sql: the actual SECURITY
-- DEFINER query lives in a non-exposed `internal` function; the `public`
-- RPC callable via PostgREST is a thin SECURITY INVOKER wrapper. Putting the
-- admin-check + elevated-privilege query directly in an exposed public
-- SECURITY DEFINER function is exactly the pattern Supabase's security
-- advisor flagged and that migration fixed for v1 — v2 needs the same
-- treatment or it reintroduces the same warning.
--
-- v1 is left in place (unused after the frontend switches to v2) rather than
-- dropped, to avoid a breaking DDL change.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_notes text;

CREATE OR REPLACE FUNCTION internal.get_admin_users_v2_data(
    p_search text DEFAULT NULL,
    p_role text DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_plan text DEFAULT NULL,
    p_sort_by text DEFAULT 'created_at',
    p_sort_dir text DEFAULT 'desc',
    p_limit int DEFAULT 25,
    p_offset int DEFAULT 0,
    p_user_id uuid DEFAULT NULL
)
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
    win_rate double precision,
    admin_notes text,
    total_count bigint
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
    WITH base AS (
        SELECT
            p.id,
            p.username,
            u.email::text AS email,
            p.role,
            COALESCE(s.plan_id, 'no_subscription')::text AS plan_id,
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
            COALESCE(st.win_rate, 0.0)::double precision AS win_rate,
            p.admin_notes
        FROM public.profiles p
        JOIN auth.users u ON p.id = u.id
        LEFT JOIN public.subscriptions s ON p.id = s.user_id
        LEFT JOIN public.user_stats st ON p.id = st.user_id
        WHERE p.deleted_at IS NULL
          AND (p_user_id IS NULL OR p.id = p_user_id)
          AND (p_user_id IS NOT NULL OR p_search IS NULL OR p_search = '' OR p.username ILIKE '%' || p_search || '%' OR u.email ILIKE '%' || p_search || '%')
          AND (p_user_id IS NOT NULL OR p_role IS NULL OR p_role = '' OR p.role = p_role)
          AND (p_user_id IS NOT NULL OR p_status IS NULL OR p_status = '' OR COALESCE(s.status, 'inactive') = p_status)
          AND (p_user_id IS NOT NULL OR p_plan IS NULL OR p_plan = '' OR COALESCE(s.plan_id, 'no_subscription') = p_plan)
    )
    SELECT base.*, COUNT(*) OVER() AS total_count
    FROM base
    ORDER BY
        CASE WHEN p_sort_by = 'username' AND p_sort_dir = 'asc' THEN base.username END ASC NULLS LAST,
        CASE WHEN p_sort_by = 'username' AND p_sort_dir = 'desc' THEN base.username END DESC NULLS LAST,
        CASE WHEN p_sort_by = 'last_active' AND p_sort_dir = 'asc' THEN base.last_active END ASC NULLS LAST,
        CASE WHEN p_sort_by = 'last_active' AND p_sort_dir = 'desc' THEN base.last_active END DESC NULLS LAST,
        CASE WHEN p_sort_by = 'total_predictions' AND p_sort_dir = 'asc' THEN base.total_predictions END ASC NULLS LAST,
        CASE WHEN p_sort_by = 'total_predictions' AND p_sort_dir = 'desc' THEN base.total_predictions END DESC NULLS LAST,
        CASE WHEN p_sort_by = 'win_rate' AND p_sort_dir = 'asc' THEN base.win_rate END ASC NULLS LAST,
        CASE WHEN p_sort_by = 'win_rate' AND p_sort_dir = 'desc' THEN base.win_rate END DESC NULLS LAST,
        CASE WHEN p_sort_by = 'status' AND p_sort_dir = 'asc' THEN base.status END ASC NULLS LAST,
        CASE WHEN p_sort_by = 'status' AND p_sort_dir = 'desc' THEN base.status END DESC NULLS LAST,
        CASE WHEN (p_sort_by IS NULL OR p_sort_by = 'created_at') AND p_sort_dir = 'asc' THEN base.created_at END ASC NULLS LAST,
        CASE WHEN (p_sort_by IS NULL OR p_sort_by = 'created_at') AND p_sort_dir <> 'asc' THEN base.created_at END DESC NULLS LAST
    LIMIT CASE WHEN p_user_id IS NULL THEN p_limit ELSE 1 END
    OFFSET CASE WHEN p_user_id IS NULL THEN p_offset ELSE 0 END;
END;
$$;

REVOKE EXECUTE ON FUNCTION internal.get_admin_users_v2_data(text, text, text, text, text, text, int, int, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION internal.get_admin_users_v2_data(text, text, text, text, text, text, int, int, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_users_v2(
    p_search text DEFAULT NULL,
    p_role text DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_plan text DEFAULT NULL,
    p_sort_by text DEFAULT 'created_at',
    p_sort_dir text DEFAULT 'desc',
    p_limit int DEFAULT 25,
    p_offset int DEFAULT 0,
    p_user_id uuid DEFAULT NULL
)
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
    win_rate double precision,
    admin_notes text,
    total_count bigint
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, internal
AS $$
    SELECT *
    FROM internal.get_admin_users_v2_data(
        p_search, p_role, p_status, p_plan, p_sort_by, p_sort_dir, p_limit, p_offset, p_user_id
    );
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_users_v2(text, text, text, text, text, text, int, int, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_users_v2(text, text, text, text, text, text, int, int, uuid) TO authenticated;
