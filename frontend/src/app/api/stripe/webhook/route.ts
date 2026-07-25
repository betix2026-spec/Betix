/**
 * BETIX — Stripe Webhook Route
 * POST /api/stripe/webhook
 *
 * Called by Stripe for each payment/subscription event.
 *
 * Listened events:
 * - checkout.session.completed -> First successful subscription
 * - invoice.paid -> Successful renewal
 * - invoice.payment_failed -> Failed payment
 * - customer.subscription.deleted -> Canceled subscription
 * - customer.subscription.updated -> Status change
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { stripe, getSubscriptionPeriodEnd } from '@/lib/stripe';
import Stripe from 'stripe';

function getErrorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}

type InvoiceWithSubscription = Stripe.Invoice & {
    subscription?: string | Stripe.Subscription | null;
};

function getInvoiceSubscriptionId(invoice: InvoiceWithSubscription): string | null {
    const subscription = invoice.subscription;
    if (!subscription) return null;
    return typeof subscription === 'string' ? subscription : subscription.id;
}

// Stripe sends the raw body, not parsed JSON.
// In the App Router, req.text() is enough to read the raw body.
// The old `api: { bodyParser: false }` config is not needed.

export async function POST(req: NextRequest) {
    try {
        const body = await req.text();
        const signature = req.headers.get('stripe-signature');

        if (!signature) {
            console.error('[Stripe/Webhook] No stripe-signature header');
            return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
        }

        // Verify the webhook signature.
        let event: Stripe.Event;
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

        if (webhookSecret) {
            try {
                event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
            } catch (error: unknown) {
                console.error('[Stripe/Webhook] Signature verification failed:', getErrorMessage(error, 'Unknown error'));
                return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
            }
        } else {
            // In development without a webhook secret, parse directly. Do not use this in production.
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

    } catch (error: unknown) {
        console.error('[Stripe/Webhook] Error:', error);
        return NextResponse.json({ received: true }, { status: 200 });
    }
}

/**
 * First successful subscription through Checkout.
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

    // Retrieve Stripe subscription details for the billing period.
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
            cancel_at_period_end: subscription.cancel_at_period_end ?? false,
            canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
            cancellation_reason: null,
            estimated_refund_amount: null,
        });

    if (status === 'trialing') {
        await supabaseAdmin
            .from('profiles')
            .update({ has_used_trial: true })
            .eq('id', userId);
    }

    console.log(`[Stripe/Webhook] Subscription saved for user ${userId}, status: ${status}`);
}

/**
 * Successful payment renewal (invoice.paid).
 */
async function handleInvoicePaid(invoice: InvoiceWithSubscription) {
    const stripeSubscriptionId = getInvoiceSubscriptionId(invoice);
    if (!stripeSubscriptionId) return;

    // Find the user by their stripe_subscription_id.
    const { data: existingSub } = await supabaseAdmin
        .from('subscriptions')
        .select('user_id, plan_id')
        .eq('stripe_subscription_id', stripeSubscriptionId)
        .single();

    if (!existingSub) {
        console.log(`[Stripe/Webhook] No subscription found for ${stripeSubscriptionId} (may be first invoice)`);
        return;
    }

    // Retrieve the period from the Stripe subscription.
    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    const currentPeriodEnd = getSubscriptionPeriodEnd(subscription);

    await supabaseAdmin
        .from('subscriptions')
        .update({
            status: 'active',
            current_period_end: currentPeriodEnd.toISOString(),
            cancel_at_period_end: subscription.cancel_at_period_end ?? false,
            canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
        })
        .eq('user_id', existingSub.user_id);

    console.log(`[Stripe/Webhook] Subscription renewed for user ${existingSub.user_id} until ${currentPeriodEnd.toISOString()}`);
}

/**
 * Failed payment.
 */
async function handleInvoiceFailed(invoice: InvoiceWithSubscription) {
    const stripeSubscriptionId = getInvoiceSubscriptionId(invoice);
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
 * Subscription deleted/canceled in Stripe.
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
        .update({
            plan_id: 'no_subscription',
            status: 'canceled',
            current_period_end: null,
            stripe_subscription_id: null,
            cancel_at_period_end: false,
            canceled_at: subscription.canceled_at
                ? new Date(subscription.canceled_at * 1000).toISOString()
                : new Date().toISOString(),
        })
        .eq('user_id', existingSub.user_id);

    console.log(`[Stripe/Webhook] Subscription canceled for user ${existingSub.user_id}`);
}

/**
 * Subscription update (status change, trial -> active, etc.).
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
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
    const isScheduledToCancel = Boolean(subscription.cancel_at_period_end);

    await supabaseAdmin
        .from('subscriptions')
        .update({
            status,
            current_period_end: currentPeriodEnd.toISOString(),
            cancel_at_period_end: isScheduledToCancel,
            canceled_at: subscription.canceled_at
                ? new Date(subscription.canceled_at * 1000).toISOString()
                : null,
        })
        .eq('user_id', existingSub.user_id);

    console.log(`[Stripe/Webhook] Subscription updated for user ${existingSub.user_id}, status: ${status}`);
}
