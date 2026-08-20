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
    };
    aiAudit?: {
        snapshot_at: string;
        odds: any;
        h2h: any;
        rolling_stats: any;
        ai_analysis: any;
        locked?: boolean;
        pending?: boolean;
    };
}
