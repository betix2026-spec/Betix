export type PlanFrequency = 'free' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'semi_annual' | 'yearly';

export interface PlanFeature {
    // Defines a single feature value within a category (e.g. "20/j" or true)
    value: string | number | boolean;
    // Optional override for display text if different from value
    display?: string;
}

export interface PlanFeatures {
    core: Record<string, PlanFeature | string | boolean>;
    advanced: Record<string, PlanFeature | string | boolean>;
    vip: Record<string, PlanFeature | string | boolean>;
}

/** @deprecated — Use trial_price/trial_days instead. Kept for migration rollback. */
export interface PlanPromo {
    price: number;
    savings: string;
    duration: string;
}

export interface Plan {
    id: string;
    name: string;
    name_en?: string | null;
    name_es?: string | null;
    name_de?: string | null;
    description: string | null;
    description_en?: string | null;
    description_es?: string | null;
    description_de?: string | null;
    price: number;
    frequency: PlanFrequency;
    features: PlanFeatures;
    /** @deprecated — Use trial_price/trial_days instead */
    promo: PlanPromo | null;
    trial_price: number | null;
    trial_days: number | null;
    strikethrough_price: number | null;
    stripe_price_id: string | null;
    is_active: boolean;
    position: number;
    badge_text: string | null;
    badge_color: string | null;
    created_at?: string;
}

export interface FeatureDefinition {
    id: string;
    label: string;
    label_en?: string | null;
    label_es?: string | null;
    label_de?: string | null;
    description: string | null;
    description_en?: string | null;
    description_es?: string | null;
    description_de?: string | null;
    type: 'text' | 'boolean' | 'number';
}
