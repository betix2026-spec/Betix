/**
 * BETIX — Stripe Cancel Subscription Route
 * POST /api/stripe/cancel
 *
 * Allows the user to cancel their subscription.
 * - Trial: immediate cancellation.
 * - Paid period: cancellation at period end.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSubscriptionPeriodEnd, stripe } from '@/lib/stripe';
import { estimateAnnualRefund } from '@/lib/billing';
import { copy } from '@/lib/i18n';
import { getLocaleFromRequest } from '@/lib/i18n-server';

function getErrorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}

export async function POST(req: NextRequest) {
    const locale = getLocaleFromRequest(req);
    const localize = (source: string) => copy(locale, source);

    try {
        // 1. Authentication
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json(
                { error: localize('Non authentifié.') },
                { status: 401 }
            );
        }

        // 2. Retrieve the current subscription.
        const { data: subscription, error: subError } = await supabaseAdmin
            .from('subscriptions')
            .select('*, plans(id, name, price, frequency)')
            .eq('user_id', user.id)
            .in('status', ['active', 'past_due', 'trialing'])
            .single();

        if (subError || !subscription) {
            return NextResponse.json(
                { error: localize('Aucun abonnement actif trouvé.') },
                { status: 404 }
            );
        }

        const stripeSubscriptionId = subscription.stripe_subscription_id;

        if (!stripeSubscriptionId) {
            return NextResponse.json(
                { error: localize('Données Stripe manquantes. Contactez le support.') },
                { status: 400 }
            );
        }

        const { reason } = await req.json().catch(() => ({ reason: null }));
        const plan = Array.isArray(subscription.plans) ? subscription.plans[0] : subscription.plans;
        const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
        const currentPeriodEnd = getSubscriptionPeriodEnd(stripeSubscription);
        const nowIso = new Date().toISOString();

        if (subscription.status === 'trialing') {
            await stripe.subscriptions.cancel(stripeSubscriptionId);

            await supabaseAdmin
                .from('subscriptions')
                .update({
                    plan_id: 'no_subscription',
                    status: 'canceled',
                    cancel_at_period_end: false,
                    canceled_at: nowIso,
                    cancellation_reason: reason || 'user_requested',
                    estimated_refund_amount: null,
                    current_period_end: null,
                    stripe_subscription_id: null,
                })
                .eq('user_id', user.id);

            console.log(`[Stripe/Cancel] Trial subscription ${stripeSubscriptionId} canceled immediately for user ${user.id}`);

            return NextResponse.json({
                success: true,
                mode: 'immediate',
                message: localize('Votre essai est annulé. Votre accès premium est terminé.')
            });
        }

        const { data: monthlyPlan } = await supabaseAdmin
            .from('plans')
            .select('price')
            .eq('frequency', 'monthly')
            .eq('is_active', true)
            .order('price', { ascending: true })
            .limit(1)
            .maybeSingle();

        const estimatedRefund = estimateAnnualRefund({
            planPrice: Number(plan?.price || 0),
            planFrequency: plan?.frequency,
            monthlyPrice: Number(monthlyPlan?.price || 0),
            subscriptionCreatedAt: subscription.created_at,
            currentPeriodEnd: subscription.current_period_end,
        });

        await stripe.subscriptions.update(stripeSubscriptionId, {
            cancel_at_period_end: true,
            cancellation_details: {
                comment: reason || 'Canceled from BETIX dashboard',
                feedback: 'other',
            },
        });

        await supabaseAdmin
            .from('subscriptions')
            .update({
                status: subscription.status === 'past_due' ? 'past_due' : 'active',
                current_period_end: currentPeriodEnd.toISOString(),
                cancel_at_period_end: true,
                canceled_at: nowIso,
                cancellation_reason: reason || 'user_requested',
                estimated_refund_amount: estimatedRefund,
            })
            .eq('user_id', user.id);

        console.log(`[Stripe/Cancel] Subscription ${stripeSubscriptionId} scheduled to cancel for user ${user.id}`);

        return NextResponse.json({
            success: true,
            mode: 'period_end',
            currentPeriodEnd: currentPeriodEnd.toISOString(),
            estimatedRefund,
            message: localize('Votre abonnement est annulé. Vous conservez votre accès jusqu’à la fin de la période déjà payée.')
        });

    } catch (error: unknown) {
        console.error('[Stripe/Cancel] Error:', error);
        return NextResponse.json(
            { error: getErrorMessage(error, localize('Erreur lors de l\'annulation.')) },
            { status: 500 }
        );
    }
}
