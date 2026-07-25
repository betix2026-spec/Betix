# Codemap — BETIX
Last updated: 2026-07-25

## Frontend
- Next.js 16 App Router in `frontend/src/app`.
- Supabase auth/session refresh and locale routing run through `frontend/src/proxy.ts`.
- Auth state is hydrated by `frontend/src/components/auth/AuthProvider.tsx`.
- Stripe route handlers live in `frontend/src/app/api/stripe`.

## Billing Invariants
- Trials cancel immediately and remove premium access.
- Paid subscriptions are scheduled with Stripe `cancel_at_period_end=true`; users keep access while `status` is `active`, `trialing`, or `past_due`.
- Scheduled cancellation state is stored on `public.subscriptions.cancel_at_period_end`, with `canceled_at`, `cancellation_reason`, and optional `estimated_refund_amount`.
- Final access removal happens on `customer.subscription.deleted`, when the subscription is moved to `no_subscription`.

## Localization
- Supported locales: `fr`, `en`, `es`, `de`.
- Locale URLs use `/{locale}` and are rewritten to existing routes by `frontend/src/proxy.ts`.
- Manual language choice is stored in `NEXT_LOCALE`; browser language is preferred before Vercel country fallback.
- Shared dictionary helpers live in `frontend/src/lib/i18n.ts`.

## Review Notes
- `/api/diag` was removed because it exposed Stripe environment details.
- Admin settings must not display live-looking API keys; use server-environment placeholders only.
- Test user passwords must come from `BETIX_TEST_USER_PASSWORD` and should never be printed.
