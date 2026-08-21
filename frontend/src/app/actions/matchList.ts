"use server"

import { createClient } from "@supabase/supabase-js"
import { localizeAnalysisText, type Locale } from "@/lib/i18n"

// Same top-tier scope as backend/app/engine/tier_scope.py, matched here by
// league display name since public.matches has no league_id — only
// league_name (text). Keep these two lists in sync if the scope ever changes.
const TOP_TIER_LEAGUE_NAMES: Record<string, Set<string>> = {
    football: new Set(["Premier League", "Ligue 1", "La Liga"]),
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
    topMarket?: string;
    topSelection?: string;
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
    matches: MatchListItem[],
    locale?: Locale | null
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
                topMarket: top.market ? localizeAnalysisText(top.market, locale) : undefined,
                topSelection: top.selection ? localizeAnalysisText(top.selection, locale) : undefined,
            };
        }
    }

    return result;
}

export type MarketTeaser = {
    source: "odds" | "form";
    homePct: number;
    awayPct: number;
    // Raw decimal odds — only present when source is "odds" (the "form"
    // fallback has no market price to show).
    homeOdds?: number;
    awayOdds?: number;
};

const PRIMARY_MARKET: Record<string, string> = {
    football: "Match Winner",
    basketball: "Home/Away",
    tennis: "Home/Away",
};

function labelSide(label: string): "home" | "away" | "draw" | null {
    const l = label.trim().toLowerCase();
    if (l === "home") return "home";
    if (l === "away") return "away";
    if (l === "draw") return "draw";
    return null;
}

/**
 * De-vigged implied win% from a bookmaker's odds (1/odds, normalized so the
 * probabilities sum to 100 — removes the bookmaker's overround). Returns
 * null if the market can't be read cleanly (missing/zero odds, no
 * recognizable home+away entries).
 */
function impliedWinPct(oddsData: { label: string; odds: number }[]): { homePct: number; awayPct: number; home: number; away: number } | null {
    let home: number | null = null;
    let away: number | null = null;
    let draw: number | null = null;
    for (const entry of oddsData) {
        const side = labelSide(entry.label);
        if (!entry.odds || entry.odds <= 0) continue;
        if (side === "home") home = entry.odds;
        else if (side === "away") away = entry.odds;
        else if (side === "draw") draw = entry.odds;
    }
    // Fall back to positional (API order is consistently home-first for the
    // markets we request) if labels didn't match the expected "Home"/"Away".
    if (home === null && away === null && oddsData.length >= 2) {
        home = oddsData[0]?.odds || null;
        away = oddsData[1]?.odds || null;
    }
    if (!home || !away) return null;

    const invHome = 1 / home;
    const invAway = 1 / away;
    const invDraw = draw && draw > 0 ? 1 / draw : 0;
    const total = invHome + invAway + invDraw;
    if (total <= 0) return null;

    return {
        homePct: Math.round((invHome / total) * 100),
        awayPct: Math.round((invAway / total) * 100),
        home,
        away,
    };
}

/**
 * Always-on, non-AI teaser for the dashboard list: an implied win% from the
 * latest odds snapshot when one exists, falling back to a recent-form
 * signal (L5 points-per-match) when it doesn't. No LLM call, no tier
 * restriction — this is meant to give every match *something*, unlike the
 * AI confidence badge which only exists for matches that were actually
 * analyzed. Callers should prefer an AI badge over this when both exist.
 */
export async function getMarketTeasers(
    matches: MatchListItem[]
): Promise<Record<string, MarketTeaser>> {
    const result: Record<string, MarketTeaser> = {};
    const withApiId = matches.filter((m) => m.apiSportId && SPORT_TABLES[m.sport]);
    if (withApiId.length === 0) return result;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
        console.error("[getMarketTeasers] Missing Supabase credentials.");
        return result;
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    const bySport = new Map<string, MatchListItem[]>();
    for (const m of withApiId) {
        if (!bySport.has(m.sport)) bySport.set(m.sport, []);
        bySport.get(m.sport)!.push(m);
    }

    for (const [sport, items] of bySport) {
        const table = SPORT_TABLES[sport];
        const marketName = PRIMARY_MARKET[sport];
        if (!table || !marketName) continue;

        const apiIds = items
            .map((m) => parseInt(m.apiSportId as string, 10))
            .filter((n) => !Number.isNaN(n));
        if (apiIds.length === 0) continue;

        // 1. Resolve external api_id -> internal analytics id for this sport.
        const { data: internalRows, error: internalErr } = await supabase
            .schema("analytics")
            .from(table)
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

        const stillNeedTeaser = new Set(internalIdToPublicId.keys());

        // 2. Odds — latest snapshot per match for the primary market.
        const { data: oddsRows, error: oddsErr } = await supabase
            .schema("analytics")
            .from("odds_snapshots")
            .select("match_id, odds_data, snapshot_at")
            .eq("sport", sport)
            .eq("market_name", marketName)
            .in("match_id", internalIds)
            .order("snapshot_at", { ascending: false });
        if (!oddsErr && oddsRows) {
            for (const row of oddsRows as { match_id: number; odds_data: unknown }[]) {
                if (!stillNeedTeaser.has(row.match_id)) continue; // already have the latest for this match
                const publicId = internalIdToPublicId.get(row.match_id);
                if (!publicId) continue;
                const oddsData = typeof row.odds_data === "string" ? JSON.parse(row.odds_data) : row.odds_data;
                const pct = Array.isArray(oddsData) ? impliedWinPct(oddsData) : null;
                if (pct) {
                    result[publicId] = {
                        source: "odds",
                        homePct: pct.homePct,
                        awayPct: pct.awayPct,
                        homeOdds: pct.home,
                        awayOdds: pct.away,
                    };
                    stillNeedTeaser.delete(row.match_id);
                }
            }
        }

        // 3. Form fallback (football/basketball only) for whatever odds didn't cover.
        if (stillNeedTeaser.size > 0 && (sport === "football" || sport === "basketball")) {
            const remaining = items.filter((m) => {
                const apiId = parseInt(m.apiSportId as string, 10);
                const row = (internalRows as { id: number; api_id: number }[]).find((r) => r.api_id === apiId);
                return row && stillNeedTeaser.has(row.id);
            });
            if (remaining.length > 0) {
                await attachFormTeasers(supabase, sport, table, remaining, internalRows as { id: number; api_id: number }[], result);
            }
        }
    }

    return result;
}

async function attachFormTeasers(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: any,
    sport: string,
    matchTable: string,
    matches: MatchListItem[],
    internalRows: { id: number; api_id: number }[],
    result: Record<string, MarketTeaser>
) {
    const rollingTable = `${sport}_team_rolling`;
    const apiIdToInternalMatchId = new Map(internalRows.map((r) => [r.api_id, r.id]));
    const internalMatchIds = matches
        .map((m) => apiIdToInternalMatchId.get(parseInt(m.apiSportId as string, 10)))
        .filter((id): id is number => id != null);
    if (internalMatchIds.length === 0) return;

    const { data: matchRows, error: matchErr } = await supabase
        .schema("analytics")
        .from(matchTable)
        .select("id, home_team_id, away_team_id")
        .in("id", internalMatchIds);
    if (matchErr || !matchRows?.length) return;

    const teamIds = Array.from(
        new Set((matchRows as { home_team_id: number; away_team_id: number }[]).flatMap((r) => [r.home_team_id, r.away_team_id]))
    );
    if (teamIds.length === 0) return;

    // Latest "all venue" L5 snapshot per team.
    const { data: rollingRows, error: rollingErr } = await supabase
        .schema("analytics")
        .from(rollingTable)
        .select("team_id, l5_ppm, date")
        .eq("venue", "all")
        .in("team_id", teamIds)
        .order("date", { ascending: false });
    if (rollingErr || !rollingRows) return;

    const latestPpmByTeam = new Map<number, number>();
    for (const row of rollingRows as { team_id: number; l5_ppm: number | null; date: string }[]) {
        if (row.l5_ppm != null && !latestPpmByTeam.has(row.team_id)) {
            latestPpmByTeam.set(row.team_id, row.l5_ppm);
        }
    }

    const apiIdToPublicId = new Map(matches.map((m) => [parseInt(m.apiSportId as string, 10), m.id]));

    for (const mr of matchRows as { id: number; home_team_id: number; away_team_id: number }[]) {
        const apiId = internalRows.find((r) => r.id === mr.id)?.api_id;
        const publicId = apiId != null ? apiIdToPublicId.get(apiId) : undefined;
        if (!publicId) continue;

        const homePpm = latestPpmByTeam.get(mr.home_team_id);
        const awayPpm = latestPpmByTeam.get(mr.away_team_id);
        if (homePpm == null || awayPpm == null) continue;

        // Not a probability — just each side's L5 points-per-match normalized
        // against the pair so the two bars/numbers are comparable at a glance.
        const total = homePpm + awayPpm;
        if (total <= 0) {
            result[publicId] = { source: "form", homePct: 50, awayPct: 50 };
            continue;
        }
        result[publicId] = {
            source: "form",
            homePct: Math.round((homePpm / total) * 100),
            awayPct: Math.round((awayPpm / total) * 100),
        };
    }
}
