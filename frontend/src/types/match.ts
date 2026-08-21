export type SportType = "football" | "basketball" | "tennis";
export type MatchStatus = "scheduled" | "upcoming" | "imminent" | "live" | "finished" | "postponed" | "cancelled";
export type PredictionLevel = "safe" | "value" | "risky";
export type FactorImpact = "positive" | "negative" | "neutral";

export interface Team {
    id?: number;
    name: string;
    short: string;
    logo?: string;
}

export interface League {
    name: string;
    country: string;
    flag?: string;
}

export interface KeyFactor {
    text: string;
    impact: FactorImpact;
}

export interface Prediction {
    type: string; // e.g., "1N2", "Over/Under"
    bet: string;  // e.g., "Victoire Real"
    odds: number | null; // null when the AI had no real market odds to cite — never fake this as 0
    confidence: number; // 0-100
    level: PredictionLevel;
    analysis: string;
    bookmaker?: string;
    rank?: number;
    keyFactors: KeyFactor[];
}

export interface Match {
    id: string;
    sport: SportType;
    league: League;
    homeTeam: Team;
    awayTeam: Team;
    date: string; // YYYY-MM-DD
    time: string; // HH:mm
    status: MatchStatus;
    statusShort?: string;
    homeScore?: number;
    awayScore?: number;
    scoreDisplay?: string;
    scoreDetails?: Record<string, any>;
    venue?: string;
    apiSportId?: string;
    predictions?: Prediction[];
    aiSummary?: string;
    // Dashboard-list-only teaser (not the full prediction) — see
    // app/actions/matchList.ts. Absent when out of scope or not generated yet.
    confidenceBadge?: {
        status: "ready" | "pending";
        topLevel?: PredictionLevel;
        topConfidence?: number;
        topOdds?: number;
        topMarket?: string;
        topSelection?: string;
    };
    // Always-on, non-AI fallback teaser (implied odds win%, or recent-form
    // when odds aren't available) — see getMarketTeasers() in
    // app/actions/matchList.ts. Only meant to be shown when confidenceBadge
    // is absent; the AI badge always takes priority when it exists.
    marketTeaser?: {
        source: "odds" | "form";
        homePct: number;
        awayPct: number;
        homeOdds?: number;
        awayOdds?: number;
    };
    aiAudit?: {
        snapshot_at: string;
        odds: any;
        h2h: any;
        rolling_stats: any;
        ai_analysis: any;
        locked?: boolean;
        pending?: boolean;
        // True once a generation has actually been requested for this match
        // (ready, pending, or failed) — false means nobody has asked yet:
        // the proactive batch pass hasn't reached it and no user has
        // clicked the "Generate" button. See app/actions/match.ts::
        // getAiAuditForMatch / requestOnDemandAudit.
        exists?: boolean;
        // True when exists=false because the last generation attempt
        // errored (not because nobody's asked yet) — lets the "Generate"
        // button say so instead of looking identical to never-attempted.
        lastFailed?: boolean;
    };
    // Read-only stats (H2H, rolling form, odds) fetched independently of the
    // AI audit — see app/actions/match.ts::getMatchStatsOnly. Always
    // available (no tier/window restriction), unlike aiAudit.
    stats?: {
        h2h: any;
        rolling_stats: any;
        odds: any;
    };
}
