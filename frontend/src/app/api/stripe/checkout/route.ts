/**
 * BETIX — Stripe Checkout Route
 * POST /api/stripe/checkout
 *
 * Flow:
 * 1. Verifies that the user is authenticated
 * 2. Creates or retrieves a Stripe Customer
 * 3. Creates a Checkout Session (mode: subscription) with a trial when applicable
 * 4. Returns the redirect URL for Stripe Checkout
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { stripe } from '@/lib/stripe';
import { copy } from '@/lib/i18n';
import { getLocaleFromRequest } from '@/lib/i18n-server';
import type Stripe from 'stripe';

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
                { error: localize('Non authentifié. Veuillez vous connecter.') },
                { status: 401 }
            );
        }

        // 2. Retrieve the requested plan.
        const { planId } = await req.json();
        if (!planId) {
            return NextResponse.json(
                { error: localize('Plan ID manquant.') },
                { status: 400 }
            );
        }

        const { data: plan, error: planError } = await supabaseAdmin
            .from('plans')
            .select('*')
            .eq('id', planId)
            .single();

        if (planError || !plan) {
            return NextResponse.json(
                { error: localize('Plan "{planId}" introuvable.').replace('{planId}', planId) },
                { status: 404 }
            );
        }

        // Free plan (0 EUR): activate directly without Stripe Checkout.
        if (plan.price <= 0 && (!plan.trial_price || plan.trial_price <= 0)) {
            // Cancel any existing Stripe subscription.
            const { data: existingSub } = await supabaseAdmin
                .from('subscriptions')
                .select('status, current_period_end, stripe_subscription_id')
                .eq('user_id', user.id)
                .single();

            if (existingSub?.stripe_subscription_id) {
                try {
                    if (existingSub.status === 'trialing') {
                        await stripe.subscriptions.cancel(existingSub.stripe_subscription_id);
                    } else {
                        await stripe.subscriptions.update(existingSub.stripe_subscription_id, {
                            cancel_at_period_end: true,
                        });
                        return NextResponse.json({
                            free: true,
                            scheduled: true,
                            redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/profile/subscription?status=scheduled_free`,
                            message: localize('Votre abonnement payant est annulé. Vous gardez votre accès premium jusqu’à la fin de la période payée.'),
                        });
                    }
                } catch (error: unknown) {
                    console.warn(`[Stripe/Checkout] Could not cancel old subscription: ${getErrorMessage(error, 'Unknown error')}`);
                }
            }

            // Activate the free plan directly in the database.
            await supabaseAdmin
                .from('subscriptions')
                .upsert({
                    user_id: user.id,
                    plan_id: planId,
                    status: 'active',
                    current_period_end: null,
                    source: 'stripe',
                    stripe_subscription_id: null,
                    cancel_at_period_end: false,
                    canceled_at: null,
                    cancellation_reason: null,
                    estimated_refund_amount: null,
                });

            console.log(`[Stripe/Checkout] Free plan "${planId}" activated for user ${user.id}`);

            const publicUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
            return NextResponse.json({
                free: true,
                redirectUrl: `${publicUrl}/profile/subscription?status=success&planId=${planId}`,
            });
        }

        // 3. Retrieve or create the Stripe Customer.
        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('id, username, stripe_customer_id')
            .eq('id', user.id)
            .single();

        let stripeCustomerId = profile?.stripe_customer_id;

        // Ignore legacy Mollie IDs (cst_...) so Stripe creates a valid customer.
        if (stripeCustomerId && stripeCustomerId.startsWith('cst_')) {
            console.log(`[Stripe/Checkout] Ignoring old Mollie customer ID: ${stripeCustomerId}`);
            stripeCustomerId = null;
        }

        if (!stripeCustomerId) {
            const customer = await stripe.customers.create({
                name: profile?.username || user.email || localize('Utilisateur BETIX'),
                email: user.email || '',
                metadata: { supabase_user_id: user.id },
            });

            stripeCustomerId = customer.id;

            await supabaseAdmin
                .from('profiles')
                .update({ stripe_customer_id: stripeCustomerId })
                .eq('id', user.id);
        }

        // 4. Resolve the Stripe Price ID.
        // If the plan has a stripe_price_id in the database, use it directly.
        // Otherwise, create an ad-hoc price through the Stripe API.
        const priceId = plan.stripe_price_id;

        if (!priceId) {
            return NextResponse.json(
                { error: localize('Le plan "{planId}" n\'a pas de stripe_price_id configuré. Configurez-le dans le dashboard Stripe puis mettez à jour la BDD.').replace('{planId}', planId) },
                { status: 400 }
            );
        }

        // 5. Create the Checkout Session.
        const publicUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

        const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
            metadata: {
                supabase_user_id: user.id,
                plan_id: planId,
            },
        };

        const sessionParams: Stripe.Checkout.SessionCreateParams = {
            customer: stripeCustomerId,
            mode: 'subscription' as const,
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${publicUrl}/profile/subscription?status=success&planId=${planId}&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${publicUrl}/profile/subscription?status=canceled`,
            metadata: {
                supabase_user_id: user.id,
                plan_id: planId,
            },
            subscription_data: subscriptionData,
        };

        // Trial handling.
        if (plan.trial_days && plan.trial_days > 0) {
            subscriptionData.trial_period_days = plan.trial_days;
        }

        const session = await stripe.checkout.sessions.create(sessionParams);

        console.log(`[Stripe/Checkout] Session created: ${session.id} for user ${user.id}`);

        return NextResponse.json({ checkoutUrl: session.url });

    } catch (error: unknown) {
        console.error('[Stripe/Checkout] Error:', error);
        return NextResponse.json(
            { error: getErrorMessage(error, localize('Erreur interne')) },
            { status: 500 }
        );
    }
}
