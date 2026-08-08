"use server"

import { createClient } from "@supabase/supabase-js"

// Same top-tier scope as backend/app/engine/tier_scope.py, matched here by
// league display name since public.matches has no league_id — only
// league_name (text). Keep these two lists in sync if the scope ever changes.
const TOP_TIER_LEAGUE_NAMES: Record<string, Set<string>> = {
    football: new Set(["Premier League", "Champions League", "La Liga"]),
    basketball: new Set(["NBA", "Euroleague", "LNB Pro A"]), // all 3 tracked leagues
};

// Tennis has no reliable tier signal on public.matches — league_name there
// is the tournament name, not a fixed set we can match against, and there's
// no ATP/WTA column yet either (see backend/scripts/updates/scheduled_audit_pass.py).
// So every tennis match is treated as "in scope" for the dashboard teaser —
// this can only ever show a badge for a match that genuinely has an audit,
// it just doesn't proactively suppress the badge for an off-scope one that
// happened to be generated on demand.
const TENNIS_ALWAYS_IN_SCOPE = true;

export type AuditSummary = {
    status: "ready" | "pending";
    topLevel?: "safe" | "value" | "risky";
    topConfidence?: number;
    topOdds?: number;
};

export type MatchListItem = {
    id: string;
    apiSportId: string | null;
    sport: string;
    leagueName: string;
};

const SPORT_TABLES: Record<string, string> = {
    football: "football_matches",
    basketball: "basketball_matches",
    tennis: "tennis_matches",
};

function isInScope(sport: string, leagueName: string): boolean {
    if (sport === "tennis") return TENNIS_ALWAYS_IN_SCOPE;
    return TOP_TIER_LEAGUE_NAMES[sport]?.has(leagueName) ?? false;
}

/**
 * Batched confidence-badge lookup for a page of dashboard matches — one
 * auth-free service-role query per sport, not one per match. Returns only
 * entries for matches that actually have a 'live' audit row; anything
 * missing from the returned map has no badge yet (out of scope, or not
 * generated — the detail page still generates on demand either way).
 */
export async function getAuditSummaries(
    matches: MatchListItem[]
): Promise<Record<string, AuditSummary>> {
    const result: Record<string, AuditSummary> = {};

    const inScope = matches.filter((m) => m.apiSportId && isInScope(m.sport, m.leagueName));
    if (inScope.length === 0) return result;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
        console.error("[getAuditSummaries] Missing Supabase credentials.");
        return result;
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    const bySport = new Map<string, MatchListItem[]>();
    for (const m of inScope) {
        const table = SPORT_TABLES[m.sport];
        if (!table) continue;
        if (!bySport.has(m.sport)) bySport.set(m.sport, []);
        bySport.get(m.sport)!.push(m);
    }

    for (const [sport, items] of bySport) {
        const apiIds = items
            .map((m) => parseInt(m.apiSportId as string, 10))
            .filter((n) => !Number.isNaN(n));
        if (apiIds.length === 0) continue;

        // 1. Resolve external api_id -> internal analytics id for this sport.
        const { data: internalRows, error: internalErr } = await supabase
            .schema("analytics")
            .from(SPORT_TABLES[sport])
            .select("id, api_id")
            .in("api_id", apiIds);
        if (internalErr || !internalRows?.length) continue;

        const internalIdToPublicId = new Map<number, string>();
        for (const row of internalRows as { id: number; api_id: number }[]) {
            const match = items.find((m) => parseInt(m.apiSportId as string, 10) === row.api_id);
            if (match) internalIdToPublicId.set(row.id, match.id);
        }

        const internalIds = Array.from(internalIdToPublicId.keys());
        if (internalIds.length === 0) continue;

        // 2. Fetch the current ('live') audit for each, scoped to this sport
        //    so match_id (not globally unique across sports) can't collide.
        const { data: audits, error: auditErr } = await supabase
            .schema("public")
            .from("ai_match_audits")
            .select("match_id, status, ai_analysis")
            .eq("sport", sport)
            .eq("run_id", "live")
            .in("match_id", internalIds);
        if (auditErr || !audits) continue;

        for (const audit of audits as { match_id: number; status: string; ai_analysis: any }[]) {
            const publicId = internalIdToPublicId.get(audit.match_id);
            if (!publicId) continue;

            if (audit.status === "pending") {
                result[publicId] = { status: "pending" };
                continue;
            }
            if (audit.status !== "ready" || !audit.ai_analysis) continue;

            const analysis =
                typeof audit.ai_analysis === "string" ? JSON.parse(audit.ai_analysis) : audit.ai_analysis;
            const categories = analysis.categories || {};
            const highest = categories.high_confidence?.[0];
            const medium = categories.medium_confidence?.[0];
            const risky = categories.risky?.[0];
            const top = highest || medium || risky;
            if (!top) continue;

            result[publicId] = {
                status: "ready",
                topLevel: highest ? "safe" : medium ? "value" : "risky",
                topConfidence: top.confidence_score,
                topOdds: top.odds,
            };
        }
    }

    return result;
}
