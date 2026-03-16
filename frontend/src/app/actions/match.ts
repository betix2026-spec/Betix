"use server"

import { createClient } from "@supabase/supabase-js"
import { createClient as createServerClient } from "@/lib/supabase/server"

export async function getAiAuditForMatch(apiId: string, sport: string) {
    if (!apiId || !sport) return null;

    // 1. Check user subscription status (Secure)
    const userSupabase = await createServerClient();
    const { data: { user } } = await userSupabase.auth.getUser();

    if (!user) return null;

    const { data: subscription } = await userSupabase
        .from('subscriptions')
        .select('status, plan_id')
        .eq('user_id', user.id)
        .in('status', ['active', 'trialing', 'past_due'])
        .maybeSingle();

    // Check user role (admin/super_admin bypass)
    const { data: profile } = await userSupabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

    const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';
    const isPremium = isAdmin || (!!subscription && subscription.plan_id !== 'no_subscription') || user.email?.endsWith('@betix.ai');

    // 2. Database credentials
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error("Missing Supabase credentials for server action");
        return null;
    }

    // Initialize using service role key to bypass schema exposure restrictions
    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        console.log(`[getAiAuditForMatch] Looking for audit: apiId=${apiId}, sport=${sport}`);
        const sportTable = sport === 'football' ? 'football_matches' :
            sport === 'basketball' ? 'basketball_matches' :
                'tennis_matches';

        let internalId = null;
        const parsedApiId = parseInt(apiId);

        // Try to get the internal ID as an integer
        if (!isNaN(parsedApiId)) {
            const { data: anaInt, error: errInt } = await supabase
                .schema('analytics')
                .from(sportTable)
                .select('id')
                .eq('api_id', parsedApiId)
                .maybeSingle();

            if (errInt) console.warn("[getAiAuditForMatch] Error looking up analytics int:", errInt);
            if (anaInt) {
                internalId = anaInt.id;
                console.log(`[getAiAuditForMatch] Found internalId via int api_id: ${internalId}`);
            }
        }

        // Try as string if integer failed
        if (!internalId) {
            const { data: anaStr, error: errStr } = await supabase
                .schema('analytics')
                .from(sportTable)
                .select('id')
                .eq('api_id', apiId)
                .maybeSingle();

            if (errStr) console.warn("[getAiAuditForMatch] Error looking up analytics string:", errStr);
            if (anaStr) {
                internalId = anaStr.id;
                console.log(`[getAiAuditForMatch] Found internalId via string api_id: ${internalId}`);
            }
        }

        // If we found the internal ID, fetch the audit
        let auditData = null;
        if (internalId) {
            const { data, error } = await supabase
                .schema('public')
                .from('ai_match_audits')
                .select('*')
                .eq('match_id', internalId)
                .eq('sport', sport)
                .order('snapshot_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) console.error("[getAiAuditForMatch] Error fetching audit:", error);
            auditData = data;
        }
        // Fallback: search by apiId directly (courtesy)
        else if (!isNaN(parsedApiId)) {
            const { data } = await supabase
                .schema('public')
                .from('ai_match_audits')
                .select('*')
                .eq('match_id', parsedApiId)
                .eq('sport', sport)
                .order('snapshot_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            auditData = data;
        }

        if (!auditData) return null;

        // 3. Gating Logic: Mask AI analysis if not premium
        if (!isPremium) {
            console.log(`[getAiAuditForMatch] Masking premium data for non-premium user: ${user.id}`);
            return {
                ...auditData,
                ai_analysis: null, // Wipe sensitive predictions
                locked: true      // Flag for frontend
            };
        }

        return auditData;

    } catch (e) {
        console.error("Error in getAiAuditForMatch:", e);
        return null;
    }
}
