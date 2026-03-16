/**
 * BETIX — Stripe Verify Route
 * POST /api/stripe/verify
 *
 * Fallback pour vérifier qu'un paiement a bien été effectué.
 * Vérifie la Checkout Session et active l'abonnement si le webhook n'a pas encore été reçu.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { stripe, getSubscriptionPeriodEnd } from '@/lib/stripe';

export async function POST(req: NextRequest) {
    try {
        // 1. Authentification
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json(
                { error: 'Non authentifié.' },
                { status: 401 }
            );
        }

        // 2. Récupérer le planId et éventuellement le session_id
        const { planId, sessionId } = await req.json();
        if (!planId) {
            return NextResponse.json(
                { error: 'Plan ID manquant.' },
                { status: 400 }
            );
        }

        // 3. Vérifier si l'abonnement est déjà actif
        const { data: existingSub } = await supabaseAdmin
            .from('subscriptions')
            .select('plan_id, status, stripe_subscription_id')
            .eq('user_id', user.id)
            .single();

        if (existingSub?.plan_id === planId && existingSub?.status === 'active' && existingSub?.stripe_subscription_id) {
            return NextResponse.json({
                verified: true,
                message: 'Abonnement déjà actif pour ce plan.'
            });
        }

        // 4. Si on a un session_id, vérifier directement cette session
        if (sessionId) {
            const session = await stripe.checkout.sessions.retrieve(sessionId);

            if (session.payment_status === 'paid' && session.subscription) {
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
                    });

                console.log(`[Stripe/Verify] Subscription verified via session ${sessionId} for user ${user.id}`);

                return NextResponse.json({
                    verified: true,
                    message: 'Abonnement activé avec succès !',
                    planId,
                    currentPeriodEnd: currentPeriodEnd.toISOString(),
                });
            }
        }

        // 5. Fallback : chercher la dernière Checkout Session complétée pour ce customer
        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('stripe_customer_id')
            .eq('id', user.id)
            .single();

        if (!profile?.stripe_customer_id) {
            return NextResponse.json({
                verified: false,
                message: 'Aucun customer Stripe trouvé. Effectuez d\'abord un paiement.'
            });
        }

        // Lister les sessions Checkout récentes pour ce customer
        const sessions = await stripe.checkout.sessions.list({
            customer: profile.stripe_customer_id,
            limit: 5,
        });

        const paidSession = sessions.data.find(s =>
            s.payment_status === 'paid' &&
            s.metadata?.plan_id === planId &&
            s.subscription
        );

        if (!paidSession) {
            return NextResponse.json({
                verified: false,
                message: 'Aucun paiement confirmé trouvé pour ce plan.'
            });
        }

        // 6. Si l'utilisateur change de plan, annuler l'ancien abonnement Stripe
        if (existingSub?.stripe_subscription_id && existingSub.plan_id !== planId) {
            try {
                await stripe.subscriptions.cancel(existingSub.stripe_subscription_id);
                console.log(`[Stripe/Verify] Old subscription ${existingSub.stripe_subscription_id} cancelled (upgrade to ${planId})`);
            } catch (err: any) {
                console.warn(`[Stripe/Verify] Could not cancel old subscription: ${err.message}`);
            }
        }

        // 7. Récupérer les détails de l'abonnement et sauvegarder
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
            });

        console.log(`[Stripe/Verify] Subscription activated for user ${user.id}, plan ${planId}`);

        return NextResponse.json({
            verified: true,
            message: 'Abonnement activé avec succès !',
            planId,
            currentPeriodEnd: currentPeriodEnd.toISOString(),
        });

    } catch (error: any) {
        console.error('[Stripe/Verify] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Erreur interne' },
            { status: 500 }
        );
    }
}
