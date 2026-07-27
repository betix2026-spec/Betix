'use server';

import { supabaseAdmin } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase/server";
import { getSubscriptionPeriodEnd, stripe } from "@/lib/stripe";
import { copy } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";
import { revalidatePath } from "next/cache";

export async function getPlansAction() {
    try {
        const { data: plans, error } = await supabaseAdmin
            .from('plans')
            .select('id, name, price, frequency')
            .order('price', { ascending: true });

        if (error) throw new Error(error.message);
        return { success: true, data: plans };
    } catch (error: any) {
        console.error("[Admin Action] Error fetching plans:", error);
        return { success: false, error: error.message };
    }
}

export interface GetAdminUsersParams {
    search?: string;
    role?: string | null;
    status?: string | null;
    plan?: string | null;
    sortBy?: string;
    sortDir?: "asc" | "desc";
    page?: number;
    pageSize?: number;
    userId?: string | null; // when set, ignores paging/filters and returns just this one user
}

/**
 * Paginated, filterable, sortable admin user list. Replaces the old
 * "fetch all 900+ users in one call" approach — get_admin_users_v2 does the
 * search/filter/sort/paging in SQL and returns a total_count column for the
 * pager.
 *
 * IMPORTANT: this must use the session-scoped client (the caller's own
 * cookies/JWT), not supabaseAdmin. The RPC checks auth.uid() internally to
 * confirm the caller is an admin — called with the service role there is no
 * auth.uid(), so the check always fails. The RPC is SECURITY DEFINER, so it
 * still runs with elevated privileges once that check passes.
 */
export async function getAdminUsersAction(params: GetAdminUsersParams = {}) {
    try {
        const supabase = await createClient();
        const { data, error } = await supabase.rpc('get_admin_users_v2', {
            p_search: params.search || null,
            p_role: params.role || null,
            p_status: params.status || null,
            p_plan: params.plan || null,
            p_sort_by: params.sortBy || 'created_at',
            p_sort_dir: params.sortDir || 'desc',
            p_limit: params.pageSize || 25,
            p_offset: ((params.page || 1) - 1) * (params.pageSize || 25),
            p_user_id: params.userId || null,
        });

        if (error) throw new Error(error.message);

        const rows = data || [];
        const totalCount = rows.length > 0 ? Number(rows[0].total_count) : 0;

        return { success: true, data: rows, totalCount };
    } catch (error: any) {
        console.error("[Admin Action] Error fetching users:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Saves a free-text admin note against a user's profile. Replaces the old
 * hardcoded placeholder paragraph that showed the same fake text for every user.
 */
export async function updateAdminNotesAction(userId: string, notes: string) {
    try {
        const { error } = await supabaseAdmin
            .from('profiles')
            .update({ admin_notes: notes })
            .eq('id', userId);

        if (error) throw new Error(error.message);

        revalidatePath('/admin/users');
        return { success: true };
    } catch (error: any) {
        console.error("[Admin Action] Update Notes Error:", error);
        return { success: false, error: error.message };
    }
}

export interface CreateAgentData {
    username: string;
    email: string;
    password: string;
    role: string;
    plan_id: string;
}

export async function createAgentAction(data: CreateAgentData) {
    console.log("[Admin Action] Creating new agent", data.email);

    try {
        // 1. Create Auth User
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: data.email,
            password: data.password,
            email_confirm: true,
            user_metadata: {
                username: data.username
            }
        });

        if (authError) throw new Error(`Auth creation failed: ${authError.message}`);
        const userId = authUser.user.id;

        // 2. Update Profile (Role & Username)
        // Note: Profile is auto-created by trigger usually, but we force update to be sure of role/username
        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .upsert({
                id: userId,
                username: data.username,
                role: data.role,
                created_at: new Date().toISOString()
            });

        if (profileError) throw new Error(`Profile creation failed: ${profileError.message}`);

        // 3. Create Subscription
        const defaultPeriodEnd = new Date();
        defaultPeriodEnd.setDate(defaultPeriodEnd.getDate() + 30); // +30 days by default

        const { error: subError } = await supabaseAdmin
            .from('subscriptions')
            .insert({
                user_id: userId,
                plan_id: data.plan_id,
                status: 'active',
                current_period_end: defaultPeriodEnd.toISOString(),
                source: 'manual_gift'
            });

        if (subError) throw new Error(`Subscription creation failed: ${subError.message}`);

        // 4. Initialize Stats (Optional, but good for consistency)
        const { error: statsError } = await supabaseAdmin
            .from('user_stats')
            .insert({
                user_id: userId,
                level: 1,
                xp_current: 0,
                xp_next: 100
            });

        // Ignore stats error as it might be handled by triggers too, just log it
        if (statsError) console.warn("Stats init warning:", statsError.message);

        revalidatePath('/admin/users');
        return { success: true, userId };

    } catch (error: any) {
        console.error("[Admin Action] Create Error:", error);
        return { success: false, error: error.message };
    }
}

export interface UpdateAgentData {
    username?: string;
    email?: string;
    password?: string;
    role?: string;
    plan_id?: string;
    subscription_status?: string;
}

export async function updateAgentAction(agentId: string, data: UpdateAgentData) {
    console.log(`[Admin Action] Updating agent ${agentId}`, data);

    try {
        // 1. Update Auth (Email & Password)
        if (data.email || data.password) {
            const authUpdates: any = {};
            if (data.email) authUpdates.email = data.email;
            if (data.password) authUpdates.password = data.password;

            const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
                agentId,
                authUpdates
            );

            if (authError) {
                console.error("[Admin Action] Auth update failed:", authError);
                throw new Error(`Auth update failed: ${authError.message}`);
            }
        }

        // 2. Update Public Profile (Username & Role)
        if (data.username || data.role) {
            const profileUpdates: any = {};
            if (data.username) profileUpdates.username = data.username;
            if (data.role) profileUpdates.role = data.role;

            const { error: profileError } = await supabaseAdmin
                .from('profiles')
                .update(profileUpdates)
                .eq('id', agentId);

            if (profileError) {
                console.error("[Admin Action] Profile update failed:", profileError);
                throw new Error(`Profile update failed: ${profileError.message}`);
            }
        }

        // 3. Update Subscription (Plan & Status)
        if (data.plan_id || data.subscription_status) {
            // First check if a subscription exists
            const { data: existingSub } = await supabaseAdmin
                .from('subscriptions')
                .select('user_id, plan_id, stripe_subscription_id')
                .eq('user_id', agentId)
                .single();

            const subUpdates: any = {};
            if (data.plan_id) subUpdates.plan_id = data.plan_id;
            if (data.subscription_status) subUpdates.status = data.subscription_status;

            // If the admin changes the plan and a Stripe subscription exists, cancel it.
            if (data.plan_id && existingSub?.stripe_subscription_id && existingSub.plan_id !== data.plan_id) {
                try {
                    await stripe.subscriptions.cancel(existingSub.stripe_subscription_id);
                    console.log(`[Admin Action] Cancelled Stripe subscription ${existingSub.stripe_subscription_id} for user ${agentId}`);
                } catch (stripeErr: any) {
                    console.warn(`[Admin Action] Could not cancel Stripe subscription: ${stripeErr.message}`);
                }
                // Clear the stripe_subscription_id since admin is overriding
                subUpdates.stripe_subscription_id = null;
                subUpdates.source = 'manual_gift';
            }

            if (existingSub) {
                const { error: subError } = await supabaseAdmin
                    .from('subscriptions')
                    .update(subUpdates)
                    .eq('user_id', agentId);

                if (subError) throw new Error(`Subscription update failed: ${subError.message}`);
            } else {
                // Create if not exists (upsert-like behavior tailored for admin override)
                const { error: subError } = await supabaseAdmin
                    .from('subscriptions')
                    .insert({
                        user_id: agentId,
                        ...subUpdates,
                        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // Default 30 days
                        source: 'manual_gift' // Audit trail
                    });

                if (subError) throw new Error(`Subscription creation failed: ${subError.message}`);
            }
        }

        revalidatePath('/admin/users');
        return { success: true };

    } catch (error: any) {
        console.error("[Admin Action] Error:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Retrieves Stripe billing details for a user.
 */
export async function getSubscriptionDetailsAction(userId: string) {
    try {
        const locale = await getServerLocale();
        const { data: subscription } = await supabaseAdmin
            .from('subscriptions')
            .select('plan_id, status, stripe_subscription_id, current_period_end, source')
            .eq('user_id', userId)
            .single();

        if (!subscription) {
            return { success: false, error: copy(locale, 'Aucun abonnement trouvé.') };
        }

        // If there is no Stripe subscription, return only database data.
        if (!subscription.stripe_subscription_id) {
            return {
                success: true,
                data: {
                    source: subscription.source || 'manual_gift',
                    planId: subscription.plan_id,
                    dbStatus: subscription.status,
                    currentPeriodEnd: subscription.current_period_end,
                    stripe: null,
                }
            };
        }

        // Call Stripe for live details.
        try {
            const stripeSub = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id) as any;
            const stripePeriodEnd = getSubscriptionPeriodEnd(stripeSub);

            return {
                success: true,
                data: {
                    source: subscription.source,
                    planId: subscription.plan_id,
                    dbStatus: subscription.status,
                    currentPeriodEnd: subscription.current_period_end,
                    stripe: {
                        id: stripeSub.id,
                        status: stripeSub.status,
                        amount: ((stripeSub.items.data[0]?.price?.unit_amount || 0) / 100).toFixed(2),
                        currency: stripeSub.currency.toUpperCase(),
                        interval: stripeSub.items.data[0]?.price?.recurring?.interval || 'month',
                        intervalCount: stripeSub.items.data[0]?.price?.recurring?.interval_count || 1,
                        currentPeriodEnd: stripePeriodEnd.toISOString(),
                        createdAt: new Date(stripeSub.created * 1000).toISOString(),
                        canceledAt: stripeSub.canceled_at ? new Date(stripeSub.canceled_at * 1000).toISOString() : null,
                        cancelAtPeriodEnd: Boolean(stripeSub.cancel_at_period_end),
                    },
                }
            };
        } catch (stripeErr: any) {
            console.warn(`[Admin Action] Could not fetch Stripe subscription: ${stripeErr.message}`);
            return {
                success: true,
                data: {
                    source: subscription.source,
                    planId: subscription.plan_id,
                    dbStatus: subscription.status,
                    currentPeriodEnd: subscription.current_period_end,
                    stripe: null,
                }
            };
        }

    } catch (error: any) {
        console.error("[Admin Action] getSubscriptionDetails Error:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Cancels a user's subscription in Stripe and moves them to no_subscription.
 * Premium access is removed immediately.
 */
export async function cancelSubscriptionAction(userId: string) {
    console.log(`[Admin Action] Terminating subscription for user ${userId}`);

    try {
        const locale = await getServerLocale();
        // 1. Retrieve the current subscription.
        const { data: subscription, error: subError } = await supabaseAdmin
            .from('subscriptions')
            .select('user_id, plan_id, status, stripe_subscription_id')
            .eq('user_id', userId)
            .single();

        if (subError || !subscription) {
            return { success: false, error: copy(locale, 'Aucun abonnement trouvé pour cet utilisateur.') };
        }

        if (subscription.plan_id === 'no_subscription') {
            return { success: false, error: copy(locale, 'L\'utilisateur n\'a déjà aucun abonnement actif.') };
        }

        // 2. Cancel in Stripe if a recurring subscription exists.
        if (subscription.stripe_subscription_id) {
            try {
                await stripe.subscriptions.cancel(subscription.stripe_subscription_id);
                console.log(`[Admin Action] Stripe subscription ${subscription.stripe_subscription_id} cancelled OK`);
            } catch (stripeErr: any) {
                const msg = stripeErr.message || '';
                if (msg.includes('canceled') || msg.includes('No such subscription')) {
                    console.log(`[Admin Action] Stripe sub already cancelled, continuing DB cleanup`);
                } else {
                    return { success: false, error: `${copy(locale, 'Échec annulation Stripe')}: ${msg}` };
                }
            }
        }

        // 3. Cancel: plan -> no_subscription, status -> canceled, access removed immediately.
        const { error: updateError } = await supabaseAdmin
            .from('subscriptions')
            .update({
                plan_id: 'no_subscription',
                status: 'canceled',
                stripe_subscription_id: null,
                current_period_end: null,
                cancel_at_period_end: false,
                canceled_at: new Date().toISOString(),
                cancellation_reason: 'admin_terminated',
                estimated_refund_amount: null,
            })
            .eq('user_id', userId);

        if (updateError) {
            throw new Error(`Subscription update failed: ${updateError.message}`);
        }

        console.log(`[Admin Action] Subscription terminated for user ${userId} (was: ${subscription.plan_id})`);

        revalidatePath('/admin/users');
        return {
            success: true,
            message: copy(locale, `Abonnement résilié. L'utilisateur n'a plus d'abonnement actif.`)
        };

    } catch (error: any) {
        console.error("[Admin Action] Cancel Error:", error);
        return { success: false, error: error.message };
    }
}
