// =============================================================================
// BETIX — Shared TypeScript types
// Normalized data structures for the three sports
// =============================================================================

// --- Enums ---

export type Sport = "football" | "basketball" | "tennis";

export type MatchStatus = "scheduled" | "live" | "finished" | "postponed" | "cancelled";

export type ConfidenceLevel = "safe" | "intermediate" | "risky";

export type FactorImpact = "positive" | "negative" | "neutral";

// --- Sports data ---

export interface League {
    id: number;
    name: string;
    logo: string;
    country: string;
    country_flag: string;
}

export interface Participant {
    id: number;
    name: string;
    logo: string;
}

export interface Score {
    home: number;
    away: number;
    details?: Record<string, unknown>;
}

export interface Match {
    id: string;
    external_id: string;
    sport: Sport;

    league: League;
    home: Participant;
    away: Participant;

    date: string; // ISO 8601
    timestamp: number;
    status: MatchStatus;

    score?: Score | null;
}

// --- Prédictions ---

export interface KeyFactor {
    icon: string;
    label: string;
    description: string;
    impact: FactorImpact;
}

export interface Prediction {
    id: string;
    match_id: string;
    sport: Sport;

    confidence_level: ConfidenceLevel;

    analysis: string; // Texte explicatif complet (markdown)
    predicted_outcome: string;
    predicted_score?: string | null;
    odds_value?: number | null;

    key_factors: KeyFactor[];

    model_used: string;
    generated_at: string; // ISO 8601
}

// --- Sports ---

export interface SportLeague {
    id: number;
    name: string;
    country: string;
    country_flag: string;
}

export interface SportInfo {
    id: Sport;
    name: string;
    icon: string;
    leagues: SportLeague[];
}

// --- API Responses ---

export interface MatchesResponse {
    count: number;
    matches: Match[];
}

export interface PredictionsResponse {
    match_id: string;
    available: boolean;
    message?: string;
    predictions: Prediction[];
}

export interface SportsResponse {
    sports: SportInfo[];
}
