-- ============================================================
-- BETIX — Migration: Automate the Default Subscription
-- Date: 2026-02-27
-- Description: Updates handle_new_user to create a
--               'no_subscription' subscription by default.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    -- 1. Create the profile
    INSERT INTO public.profiles (id, username, created_at)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || LEFT(NEW.id::text, 8)),
        now()
    );

    -- 2. Create the default settings
    INSERT INTO public.user_settings (user_id) VALUES (NEW.id);

    -- 3. Create the initial stats
    INSERT INTO public.user_stats (user_id) VALUES (NEW.id);

    -- 4. Create the default subscription (default restriction)
    -- The 'no_subscription' plan must exist in the public.plans table
    INSERT INTO public.subscriptions (user_id, plan_id, status, source)
    VALUES (NEW.id, 'no_subscription', 'active', 'mollie');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: The on_auth_user_created trigger already exists and points to this function.
