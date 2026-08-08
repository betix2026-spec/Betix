/**
 * BETIX — Stripe Server Client
 * Initialise le SDK Stripe pour les routes API server-side.
 */

import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
    if (stripeClient) return stripeClient;

    if (!process.env.STRIPE_SECRET_KEY) {
        throw new Error('[Stripe] Missing STRIPE_SECRET_KEY environment variable');
    }

    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
    return stripeClient;
}

export const stripe = new Proxy({} as Stripe, {
    get(_target, property, receiver) {
        return Reflect.get(getStripe(), property, receiver);
    },
});

/**
 * Maps a BETIX plan frequency to Stripe interval parameters.
 */
export function toStripeInterval(frequency: string): { interval: Stripe.Price.Recurring.Interval; interval_count: number } {
    switch (frequency) {
        case 'daily':       return { interval: 'day',   interval_count: 1 };
        case 'weekly':      return { interval: 'week',  interval_count: 1 };
        case 'monthly':     return { interval: 'month', interval_count: 1 };
        case 'quarterly':   return { interval: 'month', interval_count: 3 };
        case 'semi_annual': return { interval: 'month', interval_count: 6 };
        case 'yearly':      return { interval: 'year',  interval_count: 1 };
        default:            return { interval: 'month', interval_count: 1 };
    }
}

/**
 * Extracts current_period_end from a Stripe Subscription object.
 *
 * Stripe SDK v20+ (API 2026-02-25.clover) removed current_period_end
 * from the Subscription root and moved it onto each SubscriptionItem.
 * This function handles both formats to preserve backward compatibility.
 */
type SubscriptionWithLegacyPeriod = Stripe.Subscription & {
    current_period_end?: number | null;
};

type SubscriptionItemWithPeriod = Stripe.SubscriptionItem & {
    current_period_end?: number | null;
};

export function getSubscriptionPeriodEnd(subscription: SubscriptionWithLegacyPeriod): Date {
    // SDK v20+: current_period_end lives on the items
    const firstItem = subscription.items?.data?.[0] as SubscriptionItemWithPeriod | undefined;
    const periodEnd =
        firstItem?.current_period_end
        ?? subscription.current_period_end; // fallback for older SDK versions

    if (periodEnd == null) {
        throw new Error(
            `[Stripe] current_period_end not found on subscription ${subscription.id}. ` +
            `Check the Stripe SDK version.`
        );
    }

    return new Date(periodEnd * 1000);
}

/**
 * Computes the next due date from the plan frequency.
 */
export function calculateNextPeriodEnd(frequency: string): Date {
    const now = new Date();
    switch (frequency) {
        case 'daily':       now.setDate(now.getDate() + 1); break;
        case 'weekly':      now.setDate(now.getDate() + 7); break;
        case 'monthly':     now.setMonth(now.getMonth() + 1); break;
        case 'quarterly':   now.setMonth(now.getMonth() + 3); break;
        case 'semi_annual': now.setMonth(now.getMonth() + 6); break;
        case 'yearly':      now.setFullYear(now.getFullYear() + 1); break;
        default:            now.setMonth(now.getMonth() + 1);
    }
    return now;
}
