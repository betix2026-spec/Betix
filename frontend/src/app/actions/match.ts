"use server"

import { createClient } from "@supabase/supabase-js"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { after } from "next/server"

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

        // 3. Nothing in the DB, a stuck 'pending' lock, or a 'failed' analysis —
        //    trigger an on-demand generation and block on it, but ONLY for a
        //    premium user (nobody else can see the result, so nobody else
        //    should trigger its cost).
        const needsBlockingTrigger =
            !auditData ||
            auditData.status === "failed" ||
            (auditData.status === "pending" && isStuckPending(auditData.attempted_at));

        // A 'ready' audit that's old enough to be stale (mirrors
        // STALE_AFTER_HOURS in app/engine/audit_orchestration.py) still has
        // perfectly good cached content to show right now — it should
        // refresh quietly in the background, not flash "Generating..." over
        // data that's already there. Without this, a 'ready' audit was
        // served forever regardless of age: the backend's own staleness
        // check only runs when something calls ensure_audit(), and this was
        // the only caller that never did for 'ready' rows (the 30-min
        // scheduled pass does call it directly, but only for top-tier
        // matches within a 24h lookahead).
        const needsBackgroundRefresh =
            !needsBlockingTrigger &&
            auditData?.status === "ready" &&
            isStaleReady(auditData.attempted_at);

        if (needsBlockingTrigger && isPremium && internalId) {
            const triggered = await triggerAudit(sport, internalId);
            if (triggered?.state === "ready" && triggered.audit) {
                auditData = triggered.audit;
            } else {
                // "pending" — generation kicked off in the background on the backend.
                return { locked: false, pending: true, ai_analysis: null };
            }
        } else if (needsBackgroundRefresh && isPremium && internalId) {
            // Runs after the response is sent — a bare un-awaited call risks
            // being killed mid-flight once this serverless function returns.
            // The stale (but valid) auditData below is still shown immediately.
            const refreshSport = sport;
            const refreshMatchId = internalId;
            after(() => triggerAudit(refreshSport, refreshMatchId));
        }

        if (!auditData) {
            return isPremium ? { locked: false, pending: false, ai_analysis: null } : null;
        }

        if (auditData.status === "pending") {
            return { locked: false, pending: true, ai_analysis: null };
        }

        // 4. Gating Logic: Mask AI analysis if not premium
        if (!isPremium) {
            console.log(`[getAiAuditForMatch] Masking premium data for non-premium user: ${user.id}`);
            return {
                ...auditData,
                ai_analysis: null, // Wipe sensitive predictions
                locked: true      // Flag for frontend
            };
        }

        return { ...auditData, locked: false, pending: false };

    } catch (e) {
        console.error("Error in getAiAuditForMatch:", e);
        return null;
    }
}

function isStuckPending(attemptedAt: string | null | undefined): boolean {
    if (!attemptedAt) return true;
    const ageMs = Date.now() - new Date(attemptedAt).getTime();
    return ageMs > 5 * 60 * 1000; // same threshold as PENDING_LOCK_TIMEOUT_MINUTES on the backend
}

function isStaleReady(attemptedAt: string | null | undefined): boolean {
    if (!attemptedAt) return true;
    const ageMs = Date.now() - new Date(attemptedAt).getTime();
    return ageMs > 18 * 60 * 60 * 1000; // same threshold as STALE_AFTER_HOURS on the backend
}

async function triggerAudit(sport: string, matchId: number): Promise<{ state: string; audit: Record<string, unknown> | null } | null> {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
    const secret = process.env.INTERNAL_API_SECRET;
    if (!secret) {
        console.error("[triggerAudit] INTERNAL_API_SECRET is not set — cannot trigger on-demand generation.");
        return null;
    }
    try {
        const res = await fetch(`${apiUrl}/audits/${sport}/${matchId}/ensure`, {
            method: "POST",
            headers: { "X-Internal-Secret": secret },
            cache: "no-store",
        });
        if (!res.ok) {
            console.error(`[triggerAudit] Backend returned ${res.status}`);
            return null;
        }
        return await res.json();
    } catch (e) {
        console.error("[triggerAudit] Failed to reach backend:", e);
        return null;
    }
}
