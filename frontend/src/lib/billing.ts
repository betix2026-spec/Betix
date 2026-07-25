import type { PlanFrequency } from "@/types/plans";

export type CancellationKind = "trial" | "paid" | "annual";

export interface RefundEstimateInput {
    planPrice: number;
    planFrequency?: PlanFrequency | string | null;
    monthlyPrice: number;
    subscriptionCreatedAt?: string | null;
    currentPeriodEnd?: string | null;
    now?: Date;
}

export function getCancellationKind(status?: string | null, frequency?: string | null): CancellationKind {
    if (status === "trialing") return "trial";
    if (frequency === "yearly") return "annual";
    return "paid";
}

export function calculateUsedMonths(startDate?: string | null, now = new Date()): number {
    if (!startDate) return 1;
    const started = new Date(startDate);
    if (Number.isNaN(started.getTime()) || started >= now) return 1;

    const yearDiff = now.getFullYear() - started.getFullYear();
    const monthDiff = now.getMonth() - started.getMonth();
    const months = yearDiff * 12 + monthDiff + (now.getDate() > started.getDate() ? 1 : 0);
    return Math.min(12, Math.max(1, months));
}

export function estimateAnnualRefund({
    planPrice,
    planFrequency,
    monthlyPrice,
    subscriptionCreatedAt,
    now = new Date(),
}: RefundEstimateInput): number | null {
    if (planFrequency !== "yearly" || planPrice <= 0 || monthlyPrice <= 0) return null;

    const usedMonths = calculateUsedMonths(subscriptionCreatedAt, now);
    const usedValue = monthlyPrice * usedMonths;
    return Math.max(0, Number((planPrice - usedValue).toFixed(2)));
}

export function formatCurrency(amount: number, locale = "fr-FR", currency = "EUR"): string {
    return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
    }).format(amount);
}
