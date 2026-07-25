/**
 * BETIX — Stripe Verify Route
 * POST /api/stripe/verify
 *
 * Fallback to verify that a payment has completed.
 * Checks the Checkout Session and activates the subscription if the webhook has not arrived yet.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { stripe, getSubscriptionPeriodEnd } from '@/lib/stripe';
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

        // 2. Retrieve the planId and optional session_id.
        const { planId, sessionId } = await req.json();
        if (!planId) {
            return NextResponse.json(
                { error: localize('Plan ID manquant.') },
                { status: 400 }
            );
        }

        // 3. Check whether the subscription is already active.
        const { data: existingSub } = await supabaseAdmin
            .from('subscriptions')
            .select('plan_id, status, stripe_subscription_id')
            .eq('user_id', user.id)
            .single();

        const isAlreadyActive = existingSub?.plan_id === planId
            && ['active', 'trialing'].includes(existingSub?.status)
            && existingSub?.stripe_subscription_id;

        if (isAlreadyActive) {
            return NextResponse.json({
                verified: true,
                message: localize('Abonnement déjà actif pour ce plan.')
            });
        }

        // 4. If a session_id is present, verify that session directly.
        if (sessionId) {
            const session = await stripe.checkout.sessions.retrieve(sessionId);

            if (['paid', 'no_payment_required'].includes(session.payment_status) && session.subscription) {
                const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
                const currentPeriodEnd = getSubscriptionPeriodEnd(subscription);
                const status = subscription.status === 'trialing' ? 'trialing' : 'active';

                await supabaseAdmin
                    .from('subscriptions')
                    .upsert({
                        user_id: user.id,
                        plan_id: planId,
                        status,
                        current_period_end: currentPeriodEnd.toISOString(),
                        source: 'stripe',
                        stripe_subscription_id: subscription.id,
                        cancel_at_period_end: subscription.cancel_at_period_end ?? false,
                        canceled_at: null,
                        cancellation_reason: null,
                        estimated_refund_amount: null,
                    });

                console.log(`[Stripe/Verify] Subscription verified via session ${sessionId} for user ${user.id}`);

                return NextResponse.json({
                    verified: true,
                    message: localize('Abonnement activé avec succès !'),
                    planId,
                    currentPeriodEnd: currentPeriodEnd.toISOString(),
                });
            }
        }

        // 5. Fallback: find the latest completed Checkout Session for this customer.
        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('stripe_customer_id')
            .eq('id', user.id)
            .single();

        if (!profile?.stripe_customer_id) {
            return NextResponse.json({
                verified: false,
                message: localize('Aucun customer Stripe trouvé. Effectuez d\'abord un paiement.')
            });
        }

        // List recent Checkout Sessions for this customer.
        const sessions = await stripe.checkout.sessions.list({
            customer: profile.stripe_customer_id,
            limit: 5,
        });

        const paidSession = sessions.data.find(s =>
            ['paid', 'no_payment_required'].includes(s.payment_status) &&
            s.metadata?.plan_id === planId &&
            s.subscription
        );

        if (!paidSession) {
            return NextResponse.json({
                verified: false,
                message: localize('Aucun paiement confirmé trouvé pour ce plan.')
            });
        }

        // 6. If the user changes plan, cancel the old Stripe subscription.
        if (existingSub?.stripe_subscription_id && existingSub.plan_id !== planId) {
            try {
                await stripe.subscriptions.cancel(existingSub.stripe_subscription_id);
                console.log(`[Stripe/Verify] Old subscription ${existingSub.stripe_subscription_id} cancelled (upgrade to ${planId})`);
            } catch (error: unknown) {
                console.warn(`[Stripe/Verify] Could not cancel old subscription: ${getErrorMessage(error, 'Unknown error')}`);
            }
        }

        // 7. Retrieve subscription details and save them.
        const subscription = await stripe.subscriptions.retrieve(paidSession.subscription as string);
        const currentPeriodEnd = getSubscriptionPeriodEnd(subscription);
        const status = subscription.status === 'trialing' ? 'trialing' : 'active';

        await supabaseAdmin
            .from('subscriptions')
            .upsert({
                user_id: user.id,
                plan_id: planId,
                status,
                current_period_end: currentPeriodEnd.toISOString(),
                source: 'stripe',
                stripe_subscription_id: subscription.id,
                cancel_at_period_end: subscription.cancel_at_period_end ?? false,
                canceled_at: null,
                cancellation_reason: null,
                estimated_refund_amount: null,
            });

        console.log(`[Stripe/Verify] Subscription activated for user ${user.id}, plan ${planId}`);

        return NextResponse.json({
            verified: true,
            message: localize('Abonnement activé avec succès !'),
            planId,
            currentPeriodEnd: currentPeriodEnd.toISOString(),
        });

    } catch (error: unknown) {
        console.error('[Stripe/Verify] Error:', error);
        return NextResponse.json(
            { error: getErrorMessage(error, localize('Erreur interne')) },
            { status: 500 }
        );
    }
}
