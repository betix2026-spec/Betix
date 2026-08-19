'use server';

import { supabaseAdmin } from "@/lib/supabase-admin";
import { AccuracyCategoryStats, AccuracyOverview, SportAccuracyStats } from "@/types/admin";

const SPORTS = ["football", "basketball", "tennis"] as const;

// ai_match_audits.grading_results category keys -> the "safe/value/risky"
// vocabulary used everywhere else in the UI (see ConfidenceBadge, matchList.ts).
const CATEGORY_TO_TIER = {
    high_confidence: "safe",
    medium_confidence: "value",
    risky: "risky",
} as const;

type GradingCounts = { won: number; lost: number; push: number; ungraded: number };
type GradingResults = Partial<Record<keyof typeof CATEGORY_TO_TIER, GradingCounts>>;

function emptyCounts(): GradingCounts {
    return { won: 0, lost: 0, push: 0, ungraded: 0 };
}

function toStats(counts: GradingCounts): AccuracyCategoryStats {
    const decided = counts.won + counts.lost;
    return {
        ...counts,
        winRate: decided > 0 ? Math.round((counts.won / decided) * 1000) / 10 : null,
    };
}

export async function getAccuracyStatsAction(windowDays: number | null = null): Promise<{
    success: boolean;
    data?: AccuracyOverview;
    error?: string;
}> {
    try {
        let query = supabaseAdmin
            .from("ai_match_audits")
            .select("sport, grading_results, created_at")
            .not("graded_at", "is", null);

        if (windowDays !== null) {
            const since = new Date();
            since.setDate(since.getDate() - windowDays);
            query = query.gte("created_at", since.toISOString());
        }

        const { data: rows, error } = await query;
        if (error) throw error;

        const overallCounts: Record<"safe" | "value" | "risky", GradingCounts> = {
            safe: emptyCounts(),
            value: emptyCounts(),
            risky: emptyCounts(),
        };
        const bySportCounts = new Map<string, Record<"safe" | "value" | "risky", GradingCounts>>();
        const gradedAuditsBySport = new Map<string, number>();
        let gradedPicks = 0;

        for (const row of rows || []) {
            const sport = row.sport as string;
            const grading = (row.grading_results || {}) as GradingResults;

            if (!bySportCounts.has(sport)) {
                bySportCounts.set(sport, { safe: emptyCounts(), value: emptyCounts(), risky: emptyCounts() });
            }
            const sportCounts = bySportCounts.get(sport)!;
            gradedAuditsBySport.set(sport, (gradedAuditsBySport.get(sport) || 0) + 1);

            for (const [categoryKey, tier] of Object.entries(CATEGORY_TO_TIER) as [keyof typeof CATEGORY_TO_TIER, "safe" | "value" | "risky"][]) {
                const counts = grading[categoryKey];
                if (!counts) continue;

                sportCounts[tier].won += counts.won;
                sportCounts[tier].lost += counts.lost;
                sportCounts[tier].push += counts.push;
                sportCounts[tier].ungraded += counts.ungraded;

                overallCounts[tier].won += counts.won;
                overallCounts[tier].lost += counts.lost;
                overallCounts[tier].push += counts.push;
                overallCounts[tier].ungraded += counts.ungraded;

                gradedPicks += counts.won + counts.lost + counts.push + counts.ungraded;
            }
        }

        const bySport: SportAccuracyStats[] = SPORTS.filter((s) => gradedAuditsBySport.has(s)).map((sport) => {
            const counts = bySportCounts.get(sport)!;
            return {
                sport,
                safe: toStats(counts.safe),
                value: toStats(counts.value),
                risky: toStats(counts.risky),
                gradedAudits: gradedAuditsBySport.get(sport) || 0,
            };
        });

        const data: AccuracyOverview = {
            bySport,
            overall: {
                safe: toStats(overallCounts.safe),
                value: toStats(overallCounts.value),
                risky: toStats(overallCounts.risky),
            },
            gradedAudits: rows?.length || 0,
            gradedPicks,
            windowDays,
        };

        return { success: true, data };
    } catch (error: any) {
        console.error("[Accuracy Stats Action] Error:", error);
        return { success: false, error: error.message };
    }
}
