# 🎨 BETIX — Comprehensive Frontend Technical Documentation

> **Developer warning**: This document is the source of truth for BETIX's frontend architecture. The app uses **Next.js (App Router)** with a strict separation between Server Components and Client Components, particularly around authentication and monetization (paywall).

---

## 🏗️ 1. Architecture & Philosophy

BETIX's frontend is designed to be both a powerful marketing tool (premium landing page, SEO) and a responsive SaaS application (dashboard, real-time).

- **Framework**: Next.js 15+ (App Router).
- **Styling**: Tailwind CSS + shadcn/ui.
- **Backend as a Service**: Supabase (Auth, Database, Storage).
- **Payment Gateway**: Stripe.
- **Target deployment**: Vercel.

### The Server / Client Split
For performance and security, the app maximizes the use of Server Components (`page.tsx`, base `layout.tsx`) to fetch essential data server-side without showing loading spinners.
Client Components (`"use client"`) are reserved for interactivity (carousels, modals, `AuthProvider`).

---

## 🌍 2. Internationalization (i18n)

BETIX supports 4 locales — French, English, Spanish, German — via a locale-prefixed router (`/en/dashboard`, `/fr/dashboard`, etc.) and `src/lib/i18n.ts`. This file is large (~3,400 lines) and holds **two distinct, coexisting mechanisms** — know which one to use before adding new UI copy:

### `t(locale, key)` — fixed dictionary
For UI chrome that never changes at runtime (nav labels, buttons, static page copy). Each locale (`dictionaries.fr` / `.en` / `.es` / `.de`) is a full, hand-maintained key→string dictionary. Add a new string by adding the same key to all 4 dictionaries. Falls back French → English → key itself if a locale is somehow incomplete.

### `copy(locale, source)` — literal-string lookup
For copy embedded directly in components as a literal string, e.g. `copy("Some source string")`. The `literalTranslations` table maps that literal source string to its translations in the *other* 3 locales — the source string itself doubles as its own fallback in its native language. Two conventions coexist in this table, and it matters which one a new entry follows:
- **French-keyed** (majority): the key is French, values are `{en, es, de}`. Used for anything written by hand in French first.
- **English-keyed** (minority, mostly newer additions): the key is English, values are `{fr, es, de}`. Used where the surrounding code/comments are English and the literal string was written in English first.

When adding a new `copy("...")` call, add a matching entry to `literalTranslations` in the same commit — an entry-less string just silently falls back to itself in every locale, which is how French leaks into non-French views (and the reverse). There's no build-time check for this; it has to be done by hand.

### `useI18n()` (`src/lib/use-i18n.ts`)
The hook client components use to get `{ t, copy, locale }`. Server Components/Server Actions use `getServerLocale()` (`src/lib/i18n-server.ts`) plus the plain `t`/`copy` functions directly, since hooks aren't available there.

---

## 🚀 3. Routing & Guards

Next.js's routing is organized into logical groups (parenthesized folders) that don't affect the URL but apply specific `layout.tsx` files.

### `src/app/(public)`
- **Contents**: landing page (`page.tsx`), terms of service, privacy.
- **Specifics**: fully public, server-side rendered for SEO. Database access (e.g. pricing on the homepage) uses the server Supabase client (`createClient()`).

### `src/app/(auth)`
- **Contents**: login, signup, MFA, reset password.
- **Security**: if an already-logged-in user visits `/login`, they're redirected to `/dashboard`. The `redirect` query param (validated to only ever point to an internal path — no open redirect) carries the user back to wherever they were trying to go, through OAuth/magic-link too.

### `src/app/(dashboard)`
- **Contents**: the core of the app — a livescore-style match browser (Live / Upcoming / Finished tabs, date-strip navigation, league grouping, sort by time/confidence/odds — see `dashboard/page.tsx`, `MatchCard.tsx`, `MatchTable.tsx`, `DateStrip.tsx`), match detail pages with the AI analysis, and the user profile.
- **3-stage protection (crucial)**:
  1. **Middleware (`src/middleware.ts`)**: its only job is to silently refresh the Supabase session cookie (`supabase.auth.getUser()`). It does **no redirecting**.
  2. **Server guard (`layout.tsx`)**: server-side, checks a user is explicitly present. If absent → 302 redirect to `/login`. This prevents any UI flash.
  3. **Client guard (`layout-client.tsx`)**: handles more complex business cases after load:
     - **MFA**: if the user has MFA configured (`aal2` required) but is only authenticated at `aal1`, they're forced to `/mfa`.
     - **Paywall (`<SubscriptionWall />`)**: if the user has no active subscription, the entire `children` content is replaced by the paywall — the underlying page is technically unreachable. The profile pages are the exception, and stay accessible.

### `src/app/(admin)`
- **Contents**: the admin control panel — users, subscriptions, notifications, settings, AI accuracy tracking (`admin/accuracy`, see the backend README §7 for what feeds it).
- **Security**: restricted to profiles with the `admin` role in the database.

---

## 🔐 4. Authentication & Data (Supabase)

Betix uses the **Supabase SSR** ecosystem.

### The 3 Supabase clients (`src/lib/`)
1. **`supabase/client.ts`**: used in `"use client"` components. Reads the session from the existing browser cookie.
2. **`supabase/server.ts`**: used in Server Components, Server Actions, and the API. Rebuilds the session from the request headers.
3. **`supabase-admin.ts`**: **DANGER**. Uses the service role key. Bypasses every RLS rule. Mainly used for payment webhooks and privileged admin actions.

### `AuthProvider` (`src/components/auth/AuthProvider.tsx`)
Wraps the entire app (in `app/layout.tsx`).
- Hydrates the global user state (profile `public.profiles`, MFA status, subscription `public.subscriptions`).
- Exposes the `useAuth()` hook used everywhere to get `profile`, `isLoading`, `subscription`, and `isAdmin`.

---

## 💳 5. Payment Flow (Stripe)

Stripe is integrated via the official `stripe` SDK and Stripe Checkout (subscription mode).

### The Subscription Cycle
1. **The user picks a plan** via `SubscriptionWall` or the pricing page.
2. **Checkout link**: the "Subscribe" button calls `/api/stripe/checkout` with the `planId`.
3. **Session creation** (`checkout/route.ts`): the backend validates the plan, creates a Stripe Customer if needed, then creates a Checkout Session (`mode: 'subscription'`) and returns the payment URL.
4. **Confirmation (the `webhook/route.ts` webhook)**:
   - Stripe posts events (`checkout.session.completed`, `invoice.paid`, etc.) to this URL, with signature verification.
   - The handler bypasses RLS via `supabase-admin`.
   - The subscription is inserted/updated in the DB with Stripe's `current_period_end` date.
5. **Immediate access**: on return to Betix (`/profile/subscription?status=success`), `/api/stripe/verify` acts as a fallback to confirm payment if the webhook hasn't landed yet.

### Trial abuse guard
A `has_used_trial` flag on the subscriptions table prevents the cancel → resubscribe → get-another-free-trial loop for the same account. Note: a new account paired with the same payment card is a known, intentionally-unaddressed gap — not covered by this flag.

---

## 🧩 6. Key Dashboard Components

### `MatchCard.tsx` / `MatchTable.tsx`
- Receive a full `Match`-typed object (defined in `src/types/match.ts`).
- Handle **status display** logic: depending on the sport and whether the backend's live monitor has set the status to `imminent`, `live`, or `finished`, the pulsing badge shows or disappears.
- Render a `ConfidenceBadge` (`components/dashboard/ConfidenceBadge.tsx`) for top-tier matches with a ready AI analysis — a real confidence number, a pulsing "analyzing" chip while one's generating, or nothing at all for out-of-scope/ungenerated matches (never faked or locked-looking).

### `PremiumGate.tsx`
A small wrapper utility. Want to hide a specific button or stat from non-premium users? Wrap it:
```tsx
<PremiumGate fallback={<LockIcon />}>
  <SuperSecretAIAnalysis />
</PremiumGate>
```

---

## 📖 7. Frontend Developer Intervention Guide

**1. How do I change what's offered on the paywall?**
- The offers shown in `<SubscriptionWall />` are dynamic, pulled from the `public.plans` table. You can change prices or ordering from the Supabase admin panel.
- If you add a feature (e.g. "Telegram access"), add its localized label to the `public.feature_definitions` table.

**2. How do I add a Dashboard route without the paywall? (e.g. `/dashboard/settings`)**
- Go to `src/app/(dashboard)/layout-client.tsx`.
- In the `const needsSubscription` logic block, add your new route:
```javascript
const isExcludedPath = pathname === "/dashboard/profile" || pathname === "/dashboard/settings" || pathname.startsWith("/onboarding");
```

**3. CSS & Theming**
- The theme is 100% dark mode. No light mode.
- Read `globals.css`: the v2 design system relies on CSS variables for the functional colors (`--color-safe`, `--color-value`, `--color-risky`, `--color-live`) mapped onto the AI's confidence tiers. Don't use raw hex colors in Tailwind — use the semantic variables.

**4. Adding new UI copy**
- See §2 above. Every new user-facing string needs either a `t()` dictionary key (added to all 4 locale dictionaries) or a `copy()` literal-source entry (added to `literalTranslations`) in the same change — there's no automated check that catches a missing one, only a fallback to whatever language the source string happens to be written in.

**5. API Error Handling**
- Data fetching (Supabase) in Client Components should fail silently to the user.
- Use `sonner`'s toast notifications via `toast.error("Message")` rather than unstyled alerts.
