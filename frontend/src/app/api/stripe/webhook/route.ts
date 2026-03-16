/**
 * BETIX — Stripe Webhook Route
 * POST /api/stripe/webhook
 *
 * Appelée par Stripe à chaque événement de paiement/abonnement.
 *
 * Événements écoutés :
 * - checkout.session.completed → Première souscription réussie
 * - invoice.paid → Renouvellement réussi
 * - invoice.payment_failed → Échec de paiement
 * - customer.subscription.deleted → Abonnement annulé
 * - customer.subscription.updated → Changement de statut
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { stripe, getSubscriptionPeriodEnd } from '@/lib/stripe';
import Stripe from 'stripe';

// Stripe envoie du raw body, pas du JSON parsé
// Dans le App Router, utiliser req.text() suffit pour lire le raw body
// Pas besoin de l'ancienne config `api: { bodyParser: false }`

export async function POST(req: NextRequest) {
    try {
        const body = await req.text();
        const signature = req.headers.get('stripe-signature');

        if (!signature) {
            console.error('[Stripe/Webhook] No stripe-signature header');
            return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
        }

        // Vérifier la signature du webhook
        let event: Stripe.Event;
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

        if (webhookSecret) {
            try {
                event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
            } catch (err: any) {
                console.error('[Stripe/Webhook] Signature verification failed:', err.message);
                return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
            }
        } else {
            // En dev sans webhook secret, parser directement (non recommandé en prod)
            console.warn('[Stripe/Webhook] No STRIPE_WEBHOOK_SECRET set, skipping signature verification');
            event = JSON.parse(body) as Stripe.Event;
        }

        console.log(`[Stripe/Webhook] Processing event: ${event.type} (${event.id})`);

        switch (event.type) {
            case 'checkout.session.completed':
                await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
                break;

            case 'invoice.paid':
                await handleInvoicePaid(event.data.object as Stripe.Invoice);
                break;

            case 'invoice.payment_failed':
                await handleInvoiceFailed(event.data.object as Stripe.Invoice);
                break;

            case 'customer.subscription.deleted':
                await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
                break;

            case 'customer.subscription.updated':
                await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
                break;

            default:
                console.log(`[Stripe/Webhook] Unhandled event type: ${event.type}`);
        }

        return NextResponse.json({ received: true }, { status: 200 });

    } catch (error: any) {
        console.error('[Stripe/Webhook] Error:', error);
        return NextResponse.json({ received: true }, { status: 200 });
    }
}

/**
 * Première souscription réussie via Checkout.
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const userId = session.metadata?.supabase_user_id;
    const planId = session.metadata?.plan_id;
    const stripeSubscriptionId = session.subscription as string;

    if (!userId || !planId) {
        console.error('[Stripe/Webhook] Missing metadata in checkout session');
        return;
    }

    console.log(`[Stripe/Webhook] Checkout completed for user ${userId}, plan ${planId}`);

    // Récupérer les détails de l'abonnement Stripe pour la période
    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    const currentPeriodEnd = getSubscriptionPeriodEnd(subscription);
    const status = subscription.status === 'trialing' ? 'trialing' : 'active';

    await supabaseAdmin
        .from('subscriptions')
        .upsert({
            user_id: userId,
            plan_id: planId,
            status,
            current_period_end: currentPeriodEnd.toISOString(),
            source: 'stripe',
            stripe_subscription_id: stripeSubscriptionId,
        });

    console.log(`[Stripe/Webhook] Subscription saved for user ${userId}, status: ${status}`);
}

/**
 * Renouvellement de paiement réussi (invoice.paid).
 */
async function handleInvoicePaid(invoice: any) {
    const stripeSubscriptionId = invoice.subscription as string;
    if (!stripeSubscriptionId) return;

    // Trouver l'utilisateur par son stripe_subscription_id
    const { data: existingSub } = await supabaseAdmin
        .from('subscriptions')
        .select('user_id, plan_id')
        .eq('stripe_subscription_id', stripeSubscriptionId)
        .single();

    if (!existingSub) {
        console.log(`[Stripe/Webhook] No subscription found for ${stripeSubscriptionId} (may be first invoice)`);
        return;
    }

    // Récupérer la période depuis l'abonnement Stripe
    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    const currentPeriodEnd = getSubscriptionPeriodEnd(subscription);

    await supabaseAdmin
        .from('subscriptions')
        .update({
            status: 'active',
            current_period_end: currentPeriodEnd.toISOString(),
        })
        .eq('user_id', existingSub.user_id);

    console.log(`[Stripe/Webhook] Subscription renewed for user ${existingSub.user_id} until ${currentPeriodEnd.toISOString()}`);
}

/**
 * Échec de paiement.
 */
async function handleInvoiceFailed(invoice: any) {
    const stripeSubscriptionId = invoice.subscription as string;
    if (!stripeSubscriptionId) return;

    const { data: existingSub } = await supabaseAdmin
        .from('subscriptions')
        .select('user_id')
        .eq('stripe_subscription_id', stripeSubscriptionId)
        .single();

    if (!existingSub) return;

    await supabaseAdmin
        .from('subscriptions')
        .update({ status: 'past_due' })
        .eq('user_id', existingSub.user_id);

    console.log(`[Stripe/Webhook] Subscription past_due for user ${existingSub.user_id}`);
}

/**
 * Abonnement supprimé/annulé côté Stripe.
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const { data: existingSub } = await supabaseAdmin
        .from('subscriptions')
        .select('user_id')
        .eq('stripe_subscription_id', subscription.id)
        .single();

    if (!existingSub) return;

    await supabaseAdmin
        .from('subscriptions')
        .update({ status: 'canceled' })
        .eq('user_id', existingSub.user_id);

    console.log(`[Stripe/Webhook] Subscription canceled for user ${existingSub.user_id}`);
}

/**
 * Mise à jour d'abonnement (changement de statut, trial → active, etc.).
 */
async function handleSubscriptionUpdated(subscription: any) {
    const { data: existingSub } = await supabaseAdmin
        .from('subscriptions')
        .select('user_id')
        .eq('stripe_subscription_id', subscription.id)
        .single();

    if (!existingSub) return;

    let status: string;
    switch (subscription.status) {
        case 'active': status = 'active'; break;
        case 'trialing': status = 'trialing'; break;
        case 'past_due': status = 'past_due'; break;
        case 'canceled':
        case 'unpaid': status = 'canceled'; break;
        default: status = 'active';
    }

    const currentPeriodEnd = getSubscriptionPeriodEnd(subscription);

    await supabaseAdmin
        .from('subscriptions')
        .update({
            status,
            current_period_end: currentPeriodEnd.toISOString(),
        })
        .eq('user_id', existingSub.user_id);

    console.log(`[Stripe/Webhook] Subscription updated for user ${existingSub.user_id}, status: ${status}`);
}
