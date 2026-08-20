# 📐 BETIX — Granular UI/UX Functional Specification

> This document specifies every page, every section, every component, its states, its data, and its responsive behavior. It served as the blueprint for Phase 2 frontend development.
>
> **Status note (added later)**: this is the original Phase 2 design blueprint — translated and lightly corrected, but not rewritten line-by-line against the live UI. Known concrete divergences from what actually shipped:
> - **Prediction tiers**: shipped as "High Confidence / Medium Confidence / Risky" (with AI-assigned scores of 80-99 / 60-79 / 30-59), not the "Safe / Value / Risky" naming used throughout this spec.
> - **AI provider**: "Gemini API" (e.g. §11.6, §14.3) is Anthropic Claude in production.
> - **i18n**: this spec assumes a French-only app with a stray "FR/EN" language toggle in §7.3 — the shipped app has full 4-language i18n (English, French, Spanish, German) via `lib/i18n.ts`. See `frontend/README.md` §2.
> - **Visual treatment**: after this blueprint, Pricing/Auth/Admin received a further stylistic pass ("High Stakes" pricing, "The Gatekeeper" auth, "Mission Control" admin) — see [`phase2_synthesis.md`](./phase2_synthesis.md) §6.
> - **Admin dashboard & Users page**: §11 and §12 describe intent that's now actually backed by real data — the admin analytics dashboard was previously mock data and is now wired to the real DB, and the Users page's search/filters/pagination/CSV export/Admin Notes are now fully functional rather than partially wired.
> - **Admin notifications**: §15.3 envisioned "reply via email client" — the shipped version shows sender identity and an in-app reply action instead.
>
> For the current architecture, see `backend/README.md` and `frontend/README.md`. This file remains useful as the original component/behavior-level spec.

---

## Table of Contents

### User View
1. [Global (Shared) Components](#1-global-shared-components)
2. [Landing Page](#2-landing-page)
3. [Auth Pages](#3-auth-pages)
4. [Dashboard](#4-dashboard)
5. [Match Detail Page](#5-match-detail-page)
6. [Pricing Page](#6-pricing-page)
7. [User Profile Page](#7-user-profile-page)
8. [Cross-Cutting States](#8-cross-cutting-states)
9. [Detailed User Journeys](#9-detailed-user-journeys)

### Admin View (Control Tower)
10. [Admin — Layout & Navigation](#10-admin--layout--navigation)
11. [Admin — Analytics Dashboard](#11-admin--analytics-dashboard)
12. [Admin — User Management](#12-admin--user-management)
13. [Admin — Subscription & Revenue Management](#13-admin--subscription--revenue-management)
14. [Admin — System Configuration](#14-admin--system-configuration)
15. [Admin — Notification Center](#15-admin--notification-center)
16. [Admin — Detailed Admin Journeys](#16-admin--detailed-admin-journeys)

### Reference
17. [Complete React Component Inventory](#17-complete-react-component-inventory)

---

## 1. Global (Shared) Components

These components appear on multiple pages and should be designed first.

### 1.1 `<Navbar />` (Main Navigation)

**Variants**:
- **Public** (Landing, Pricing, Auth): Logo + Links (Features, Pricing) + CTA "Log in" / "Sign up".
- **Private** (Dashboard, Match, Profile): Logo + SportSelector + CreditsCounter + UserMenu.

**Internal components**:
| Component | Description | Data | Interaction |
|---|---|---|---|
| `<Logo />` | Clickable BETIX logo | None | Click → back to Landing (public) or Dashboard (private) |
| `<NavLinks />` | Navigation links | List of routes | Click → navigate. Active state on current route |
| `<SportSelector />` | Tabs ⚽🏀🎾 | Active sport (state) | Click → changes sport, reloads matches |
| `<CreditsCounter />` | "2/2 analyses remaining" | `user.free_predictions_used` | Shows the counter. Pulse animation when 0 remain |
| `<UserMenu />` | Avatar + Dropdown | `user.name`, `user.subscription_status` | Click → menu (Profile, Settings, Log out). "PRO" badge if subscribed |

**Responsive Behavior**:
- **Desktop** (≥1024px): fixed horizontal bar at top, all elements visible.
- **Mobile** (<1024px): Logo + hamburger menu. SportSelector moves below the navbar as horizontally scrollable tabs. CreditsCounter moves into the hamburger menu.

**States**:
- `scrolled`: When the user scrolls, the navbar switches to `bg-slate-900/80 backdrop-blur-lg` (glassmorphism).
- `menu-open`: On mobile, the menu opens as a full-screen overlay with a slide-in animation.

---

### 1.2 `<Footer />`

**Used on**: Landing, Pricing only (not in the Dashboard).

**Sections**:
| Section | Content |
|---|---|
| Column 1 — Brand | Logo + Tagline ("AI predictions for demanding bettors") |
| Column 2 — Product | Links: Features, Pricing, FAQ |
| Column 3 — Legal | Links: Terms of Service, Privacy Policy, Legal Notices |
| Column 4 — Contact | Support email, social icons |
| Bottom bar | "© 2026 BETIX. All rights reserved." + responsible gambling notice |

**Responsive**: 4 columns desktop → 2 columns tablet → 1 column mobile (stacked).

---

### 1.3 `<Toast />` (Notifications)

Ephemeral notifications appearing bottom-right (desktop) or top (mobile).

| Type | Color | Icon | Example |
|---|---|---|---|
| `success` | Emerald | ✅ | "Subscription activated successfully!" |
| `error` | Red | ❌ | "Payment error. Please try again." |
| `info` | Blue | ℹ️ | "New analysis available for PSG vs Marseille" |
| `warning` | Amber | ⚠️ | "You have only one free analysis left" |

**Behavior**: appears with a slide-in animation, disappears after 5s or when the "×" is clicked.

---

### 1.4 `<LoadingSkeleton />`

Animated placeholder (shimmer effect) shown while data loads.

**Variants**:
- `skeleton-card`: match-card shape (rounded rectangle).
- `skeleton-text`: text lines (3-4 bars of varying widths).
- `skeleton-gauge`: circle for the confidence gauge.

---

### 1.5 `<PaywallOverlay />`

Blocking component shown over content for free users who've used up their quota.

**Structure**:
- Background: `backdrop-blur-md` (real content is blurred behind it, visible but unreadable).
- Central frame:
  - 🔒 icon
  - Title: "Unlock the full analysis"
  - Subtitle: "Get every AI analysis for just €1/month"
  - `<Button variant="primary" size="lg">` → "Go Premium"
  - Discreet link: "See plans"

**Required data**: `user.subscription_status`, `user.free_predictions_used`.

---

## 2. Landing Page

**Route**: `/`
**Goal**: visitor → signup conversion.
**Layout**: single-scroll page (one-page), no sidebar.

### 2.1 Hero Section

| Component | Detail |
|---|---|
| `<HeroHeadline />` | Main title: e.g. "The AI that beats the bookmakers". `text-5xl font-bold` desktop, `text-3xl` mobile. Gradient text (blue → indigo) |
| `<HeroSubtitle />` | Explanatory subtitle (1-2 lines). `text-lg text-slate-400` |
| `<HeroCTA />` | Two buttons: "Free Trial" (Primary, large) + "See a demo" (Ghost). Horizontal spacing desktop, stacked vertically mobile |
| `<HeroVisual />` | Animated image/illustration of a dashboard. Positioned right (desktop) or below (mobile). Light parallax effect on scroll |
| `<TrustBadges />` | Strip below the hero: "🔒 Secure data · ⚡ Real-time analysis · 🎯 10,000+ predictions generated". `text-sm text-slate-500` |

**Data**: static (no API call).

---

### 2.2 "How It Works" Section

3 steps illustrated in columns:
| Step | Icon | Title | Description |
|---|---|---|---|
| 1 | 📊 | "We collect the data" | "Form stats, injuries, head-to-heads, weather... Our AI digests hundreds of data points." |
| 2 | 🧠 | "The AI analyzes" | "Our AI engine cross-references the data and generates 3 betting scenarios." |
| 3 | 🎯 | "You decide" | "Pick the risk level that suits you: Safe, Balanced, or Risky." |

**Component**: `<StepCard />` with icon animating on scroll (fade-in + slide-up).
**Responsive**: 3 columns desktop → stacked vertically mobile.

---

### 2.3 "Sports Covered" Section

3 sport cards side by side:
| Component | Detail |
|---|---|
| `<SportShowcaseCard />` | Large card with: sport icon + name + example covered leagues + number of matches analyzed per day (mock). Hover effect: slight lift + sport-colored border glow |

**Sports**:
- ⚽ Football: "Premier League, La Liga, Ligue 1, Champions League..."
- 🏀 Basketball: "NBA, Euroleague, Liga ACB..."
- 🎾 Tennis: "ATP, WTA, Grand Slams..."

---

### 2.4 "Example Prediction" Section (Live Demo)

**Component**: `<DemoPredictor />`

A **mini interactive widget** showing a fictional example prediction. The user can click the Safe/Medium/Risky tabs to see the different tiers.

**Structure**:
- Header: fictional match ("PSG vs Marseille — Ligue 1").
- 3 clickable tabs (Safe 🟢 / Value 🟡 / Risky 🔴).
- Active tab content:
  - Prediction: "PSG win + Over 2.5 goals"
  - Odds: "1.65"
  - Confidence: gauge at 82%
  - Summary: 2-3 lines of analysis
  - Key factors: 3 bullets (✅ Home form, ⚠️ Mbappé uncertain, ✅ Favorable H2H)
- **Call to action** below the widget: "Get this analysis for your matches → Free signup"

**Note**: all data is hardcoded (mock). No API call.

---

### 2.5 Testimonials / Social Proof Section

| Component | Detail |
|---|---|
| `<TestimonialCard />` | Photo (avatar), name, quote, rating (★★★★★). Colored left border |
| Carousel | 3 testimonials, auto-scroll or swipe on mobile |

**Data**: static (fictional for the MVP, replaced with real reviews later).

---

### 2.6 Pricing Section (Preview)

Quick pricing overview with a CTA to the full `/pricing` page.

| Element | Detail |
|---|---|
| Title | "AI predictions starting at €1/month" |
| 2 cards side by side | "Free" vs "Premium" with feature list |
| CTA | "See all plans" → link to `/pricing` |

---

### 2.7 FAQ Section

**Component**: `<AccordionFAQ />`
- List of Q&As in an accordion (click to expand).
- Key questions:
  1. "Does BETIX guarantee winnings?"
  2. "How does the AI analysis work?"
  3. "Which sports are covered?"
  4. "How do I cancel my subscription?"
  5. "Is the data reliable?"

---

### 2.8 Final CTA Section

Full-width banner with gradient (blue → indigo):
- Title: "Ready to level up?"
- CTA: "Get started for free" (white button on colored background).

---

## 3. Auth Pages

### 3.1 Login Page (`/login`)

**Layout**: split screen (desktop). Left = form, right = visual/illustration.

**Form components**:
| Component | Detail |
|---|---|
| `<InputField label="Email" type="email" />` | Validation: email format. Error state: red border + message |
| `<InputField label="Password" type="password" />` | Visibility toggle (eye icon). Min 8 characters |
| `<Button type="submit">` | "Log in" — disabled if fields are empty. Loading spinner during the request |
| `<OAuthButton provider="google" />` | "Continue with Google" — Google icon + text |
| `<Link />` | "Forgot password?" → `/reset-password` |
| `<Link />` | "Don't have an account? Sign up" → `/signup` |

**Form states**:
- `idle`: blank form.
- `loading`: button disabled + spinner.
- `error`: message under the offending field ("Incorrect email or password").
- `success`: redirect to `/dashboard`.

**Responsive**: split screen desktop → centered full-screen form mobile (visual hidden).

---

### 3.2 Signup Page (`/signup`)

Same as Login with extra fields:
| Component | Detail |
|---|---|
| `<InputField label="Full name" />` | Min 2 characters |
| `<InputField label="Email" />` | Format + uniqueness validation (server-side check) |
| `<InputField label="Password" />` | Min 8 chars, strength indicator (weak/medium/strong) |
| `<InputField label="Confirm password" />` | Must match the previous field |
| `<Checkbox />` | "I agree to the Terms of Service and Privacy Policy" (required) |
| `<Button>` | "Create my account" |
| `<OAuthButton provider="google" />` | "Sign up with Google" |

**Post-signup**: redirect to an Onboarding screen.

---

### 3.3 Post-Signup Onboarding (`/onboarding`)

**3 steps (Stepper)**:

| Step | Component | Detail |
|---|---|---|
| 1 — "Your Sports" | `<SportSelectionGrid />` | 3 clickable cards (Football, Basketball, Tennis). Multi-select. At least 1 required. "Selected" effect = blue border + checkmark |
| 2 — "Your Profile" | `<ProfileSetup />` | Experience level (Beginner / Intermediate / Expert) via `<RadioGroup />` |
| 3 — "Let's go!" | `<OnboardingSummary />` | Summary of choices + CTA "Go to Dashboard" |

**Progress indicator**: progress bar or dots (●●○).
**Skip available**: "Skip" link on every step (except the last).

---

### 3.4 Reset Password Page (`/reset-password`)

| Component | Detail |
|---|---|
| `<InputField label="Email" />` | Recovery email |
| `<Button>` | "Send reset link" |
| **Success state** | Message "An email has been sent to xxx@xxx.com" |

---

## 4. Dashboard

**Route**: `/dashboard`
**Goal**: overview of today's matches with quick access to analyses.
**Layout**: Navbar (top) + main content. No sidebar.

### 4.1 `<DashboardHeader />`

| Component | Detail |
|---|---|
| `<DateDisplay />` | "Tuesday, February 11, 2026". ← → arrows to navigate between days. "Today" button to return |
| `<MatchCounter />` | "12 matches available" — updates dynamically with filters |
| `<ViewToggle />` | Icons to switch between "Grid" (Bento) and "List" (compact) views |

---

### 4.2 `<SportTabs />`

Horizontal tabs to filter by sport.

| Tab | Label | Icon | Badge |
|---|---|---|---|
| All | "All" | 🏆 | Total match count |
| Football | "Football" | ⚽ | Football match count |
| Basketball | "Basketball" | 🏀 | Basketball match count |
| Tennis | "Tennis" | 🎾 | Tennis match count |

**Active state**: blue background + white text.
**Responsive**: horizontally scrollable tabs on mobile.

---

### 4.3 `<LeagueFilter />`

Secondary filter under SportTabs.
- **Type**: multi-select dropdown OR clickable pills.
- **Data**: list of leagues available for the selected sport.
- **Football example**: "Premier League", "La Liga", "Ligue 1", "Serie A", "Bundesliga".
- **Default state**: "All leagues".

---

### 4.4 `<MatchGrid />` (Match Grid)

**Layout**: CSS Grid — 3 columns desktop / 2 tablet / 1 mobile.

Each cell contains a `<MatchCard />`.

---

### 4.5 `<MatchCard />`

The most important Dashboard component. It must give enough information to prompt a click without being overloaded.

**Internal structure**:
```
┌──────────────────────────────────┐
│ ⚽ Premier League      19:45    │ ← LeagueBadge + MatchTime
│                                  │
│  [Logo] Arsenal  2 - 1  Chelsea [Logo] │ ← TeamRow (logos + names + score)
│                                  │
│  🟢 Safe · 85% confidence       │ ← QuickPredictBadge
│                                  │
│  ▸ See analysis                 │ ← CTA Link
└──────────────────────────────────┘
```

| Sub-Component | Data | Detail |
|---|---|---|
| `<LeagueBadge />` | `match.league.name`, `match.league.logo` | Small league logo + name. `text-xs text-slate-500` |
| `<MatchTime />` | `match.date` | Formatted time. If "LIVE" → animated red pulsing `<LiveBadge />` |
| `<TeamRow />` | `match.home_team`, `match.away_team` + logos | 32x32 logos, `font-medium` names, `font-bold text-xl` score (if in progress/finished) |
| `<QuickPredictBadge />` | `prediction.confidence_level`, `prediction.confidence_score` | Colored badge (🟢🟡🔴) + "85% confidence". Only visible if a prediction exists |
| `<CTALink />` | — | "See analysis →". Link to `/dashboard/match/[id]` |

**States**:
- `upcoming`: score not shown. Time visible. "Upcoming" badge.
- `live`: score updated. Pulsing red `<LiveBadge />`. Green left border.
- `finished`: final score. "FT" (Full Time) badge. Slightly reduced opacity.
- `loading`: `<LoadingSkeleton variant="card" />`.
- `hover`: `translate-y-[-2px]`, increased shadow, subtle blue border.

**API data**: `GET /api/matches/today?sport={sport}&league={league}`.

---

### 4.6 `<EmptyState />`

When no match is available for the selected filters.
- Illustration (sad icon or empty calendar).
- Text: "No {sport} matches scheduled today."
- CTA: "See tomorrow's matches →" or "Explore another sport".

---

## 5. Match Detail Page

**Route**: `/dashboard/match/[id]`
**Goal**: consume the AI prediction. This is THE core of the product's value.
**Layout**: full width, vertical scroll, stacked sections.

### 5.1 `<MatchHeader />`

Top banner with the match's essential info.

```
┌─────────────────────────────────────────────────────────────┐
│  ⚽ Premier League — Matchday 24            🔴 LIVE 67'    │
│                                                              │
│     [Logo 64px]                    [Logo 64px]               │
│      Arsenal          2 — 1         Chelsea                  │
│                                                              │
│  📍 Emirates Stadium · ☁️ 12°C · 🕐 Kickoff: 20:45          │
└─────────────────────────────────────────────────────────────┘
```

| Sub-Component | Data | Detail |
|---|---|---|
| `<LeagueInfo />` | `match.league`, `match.round` | Logo + league name + matchday |
| `<MatchStatus />` | `match.status`, `match.elapsed` | "LIVE 67'" (pulsing) or "20:45" or "Finished" |
| `<TeamDisplay />` | `team.name`, `team.logo`, `team.score` | Large logo (64px), name in `text-2xl font-bold`, score in `text-4xl` |
| `<MatchContext />` | `match.venue`, `match.weather` | Venue + weather (important for tennis/football). `text-sm text-slate-400` |

---

### 5.2 `<PredictionPanel />`

**The main component. It takes up 60-70% of the width on desktop.**

#### 5.2.1 `<RiskTabs />`

3 tabs for the prediction tiers:
| Tab | Label | Color | Typical odds |
|---|---|---|---|
| Safe | "🟢 Safe" | Emerald | 1.30–1.70 |
| Value | "🟡 Balanced" | Amber | 1.80–2.50 |
| Risky | "🔴 Risky" | Red | 3.00+ |

**Active state**: colored bottom border + slightly tinted background.
**Default**: "Safe" tab active.

#### 5.2.2 `<PredictionContent />` (Active tab content)

| Sub-Component | Data | Detail |
|---|---|---|
| `<PredictionOutcome />` | `prediction.predicted_outcome` | E.g. "Arsenal win + Over 2.5 goals". `text-lg font-semibold` |
| `<OddsDisplay />` | `prediction.odds_value` | Odds display: "Odds: 1.65". With subtext "Estimated value: ★★★☆☆" |
| `<ConfidenceGauge />` | `prediction.confidence_score` | **Animated SVG circular gauge**. Percentage in the center. Dynamic color (green >70%, yellow 50-70%, red <50%) |
| `<AnalysisText />` | `prediction.prediction_text` | AI analysis text (3-5 paragraphs). Markdown formatted (bold, italic). Scrollable if too long |
| `<KeyFactors />` | `prediction.key_factors[]` | List of 4-6 factors. Each factor: icon (✅❌⚠️) + text + impact (Positive/Negative/Neutral). Rendered via `<FactorChip />` |
| `<PredictedScore />` | `prediction.predicted_score` | Predicted score (e.g. "2-1"). Shown in a discreet mini-badge |

#### 5.2.3 `<GatingLayer />`

**Conditional**: appears ONLY if `user.subscription_status === 'free'` AND `user.free_predictions_used >= 2`.
- `<PredictionContent />` content is rendered but blurred (`blur-md`).
- `<PaywallOverlay />` is overlaid.

---

### 5.3 `<StatsPanel />`

**Side panel (desktop) or scrollable section (mobile) with raw data.**

#### 5.3.1 `<FormChart />`

| Component | Detail |
|---|---|
| Type | Horizontal bar chart or badge series |
| Data | Each team's last 5 matches |
| Format | W (green) / D (gray) / L (red) for each match |
| Library | Lightweight Chart.js or custom SVG component |

#### 5.3.2 `<H2HHistory />`

| Component | Detail |
|---|---|
| Type | List of the last 5 head-to-head meetings |
| Per row | Date + Score + Competition |
| Summary | "Arsenal: 3 wins · Draws: 1 · Chelsea: 1 win" |

#### 5.3.3 `<StandingsWidget />`

| Component | Detail |
|---|---|
| Type | Mini standings table (5 rows: 2 above, the team, 2 below) |
| Columns | Position, Team, Pts, P, W, D, L |
| Highlight | Each match team's row highlighted |

#### 5.3.4 `<TeamStatsComparison />`

| Component | Detail |
|---|---|
| Type | Face-to-face comparative horizontal bars |
| Stats | Goals scored/conceded, average possession, shots on target/match, corners/match |
| Rendering | Blue bar (Home) vs red bar (Away) |

---

### 5.4 Match Page Responsive Layout

- **Desktop (≥1280px)**: 2 columns — `<PredictionPanel />` (65%) | `<StatsPanel />` (35%).
- **Tablet (768-1279px)**: single column. PredictionPanel then StatsPanel stacked.
- **Mobile (<768px)**: single column. Compact MatchHeader (smaller logos). Scrollable tabs. StatsPanel as expandable sections (accordion).

---

## 6. Pricing Page

**Route**: `/pricing`
**Goal**: free → paid conversion.

### 6.1 `<PricingHeader />`

- Title: "Choose your plan"
- Subtitle: "Access the market's most accurate AI analysis"
- `<BillingToggle />`: "Monthly / Annual" switch with a "-20%" badge on Annual.

### 6.2 `<PricingTable />`

2 or 3 cards side by side:

| Plan | Free | Premium | Premium Annual |
|---|---|---|---|
| Price | €0 | €9.99/month (€1 first month) | €95.88/year (€7.99/month) |
| Analyses/day | 2 | Unlimited | Unlimited |
| Sports | All | All | All |
| Risk tiers | Safe only | Safe + Value + Risky | Safe + Value + Risky |
| Detailed stats | ❌ | ✅ | ✅ |
| Match alerts | ❌ | ✅ | ✅ |
| Priority support | ❌ | ❌ | ✅ |
| **CTA** | "Get started" | "Try for €1" (highlighted) | "Save 20%" |

**Design**:
- The "Premium" card is elevated (`scale-105`, `ring-2 ring-blue-500`, "POPULAR" badge).
- Every feature has an icon (✅ or ❌).

### 6.3 `<PricingFAQ />`

Pricing-specific accordion:
1. "Can I cancel anytime?"
2. "How does the €1 offer work?"
3. "What payment methods do you accept?"
4. "Is there a commitment?"

### 6.4 `<MoneyBackGuarantee />`

Badge/banner: "Satisfaction guaranteed or your money back within 14 days. No questions asked."

---

## 7. User Profile Page

**Route**: `/dashboard/profile`
**Goal**: account and subscription management.

### 7.1 `<ProfileHeader />`

| Component | Detail |
|---|---|
| `<Avatar />` | Profile photo (or initials). Clickable to change |
| `<UserInfo />` | Name, Email, Signup date |
| `<SubscriptionBadge />` | "Free" (gray) or "Premium" (blue gradient) or "Premium Annual" (gold gradient) |

### 7.2 `<SubscriptionCard />`

| Component | Detail |
|---|---|
| Current status | "Premium — Active until March 11, 2026" |
| "Manage subscription" button | Redirects to the Stripe Customer Portal |
| "Change plan" button | → `/pricing` URL |
| Payment history | List of the last 5 payments (date, amount, status) |

### 7.3 `<PreferencesForm />`

| Field | Type | Detail |
|---|---|---|
| Favorite sports | Checkbox group | ⚽🏀🎾 — sets the Dashboard's default filter |
| Favorite leagues | Multi-select dropdown | Leagues shown with priority |
| Language | Select | English / French / Spanish / German |
| Email notifications | Toggle switch | Enable/disable daily summaries |

### 7.4 `<DangerZone />`

- "Log out" button (Secondary).
- "Delete my account" button (Red, with double confirmation modal: "Are you sure? This action is irreversible.").

---

## 8. Cross-Cutting States

### 8.1 Authentication States

| State | Behavior |
|---|---|
| `anonymous` | Access to: Landing, Pricing, Login, Signup. Dashboard redirects to Login |
| `authenticated_free` | Full Dashboard access. Predictions limited to 2/day. PaywallOverlay on the 3rd |
| `authenticated_premium` | Full access to everything. No PaywallOverlay. "PRO" badge in UserMenu |
| `authenticated_admin` | Full access + Admin view (`/admin/*`). "ADMIN" badge in UserMenu. "Control Tower" link in the dropdown |
| `session_expired` | Toast "Your session has expired" + redirect to Login |

### 8.2 Loading States

| Page/Component | Loading State |
|---|---|
| Dashboard | Skeleton grid (6 skeleton cards) |
| MatchCard | Individual skeleton card |
| PredictionPanel | Skeleton text (8 lines) + skeleton gauge |
| StatsPanel | Skeleton bars + skeleton table |

### 8.3 Error States

| Error | Component | Behavior |
|---|---|---|
| Backend API down | `<ErrorBanner />` | Red banner at top: "Service temporarily unavailable. Please try again shortly." + "Retry" button |
| Match not found | `<NotFoundPage />` | "This match doesn't exist or is no longer available." + link back to Dashboard |
| Network error | `<OfflineNotice />` | Warning toast "Connection lost. Check your network." |

---

## 9. Detailed User Journeys

### 9.1 "Discovery → Conversion" Journey (New Visitor)

```
Landing Page
  → Scroll → sees the DemoPredictor widget
  → Clicks "📊 See the full analysis"
  → [If not logged in] Redirect → /signup
  → Fills out the form → creates their account
  → /onboarding (3 steps: Sports, Profile, Go!)
  → /dashboard (filtered to their favorite sports)
  → Clicks a MatchCard → /dashboard/match/[id]
  → Sees the full Safe prediction (1st free analysis)
  → Back to Dashboard → clicks a 2nd match
  → Sees the prediction (2nd free analysis)
  → Back to Dashboard → clicks a 3rd match
  → ⚠️ PaywallOverlay appears on the PredictionPanel
  → Warning toast "Last free analysis used"
  → Clicks "Go Premium" → Stripe Checkout (€1)
  → Back to /dashboard → success toast "Welcome to Premium! 🎉"
  → Every analysis is now accessible
```

### 9.2 "Daily Usage" Journey (Premium Subscriber)

```
Opens the app (persistent session, no login)
  → /dashboard shown with their favorite sport (e.g. Tennis)
  → Quick scan of MatchCards
  → Spots a "🟢 Safe 89%" badge
  → Clicks → /dashboard/match/[id]
  → Reads the Safe analysis in 30 seconds
  → Switches to the "🟡 Value" tab to compare
  → Checks H2H stats and recent form
  → Makes their decision (off-platform)
  → Back to Dashboard for the next match
```

### 9.3 "Subscription Management" Journey

```
Dashboard → UserMenu → "My profile"
  → /dashboard/profile
  → Sees status "Premium — Active"
  → Clicks "Manage subscription"
  → [Redirect to Stripe Customer Portal]
  → Can: change card, switch to annual, cancel
  → Back on BETIX
```

---

---

# 🛡️ ADMIN VIEW — Control Tower

> The Admin Panel is a separate space (`/admin/*`) accessible only to users with the `admin` role. It offers **full control** over the application without requiring technical skills. It's the manager's control tower.

---

## 10. Admin — Layout & Navigation

**Base route**: `/admin`
**Access**: `user.role === 'admin'` only. Any other user is redirected to `/dashboard` with an error toast.

### 10.1 `<AdminLayout />`

**Structure**: fixed sidebar (left) + main content (right) + top header.
A completely different layout from the user view.

```
┌───────────┬──────────────────────────────────────────┐
│           │  🔔 3   Admin Betix        👤 Admin ▼   │ ← AdminHeader
│  BETIX    ├──────────────────────────────────────────┤
│  ADMIN    │                                          │
│           │                                          │
│  📊 Dashboard  │         Main Content                 │
│  👥 Users      │                                     │
│  💳 Subscriptions│                                    │
│  ⚙️ Config     │                                      │
│  🔔 Notifications│                                    │
│           │                                          │
│  ─────    │                                          │
│  ↩️ Back to App │                                     │
└───────────┴──────────────────────────────────────────┘
```

### 10.2 `<AdminSidebar />`

| Item | Icon | Route | Description |
|---|---|---|---|
| Dashboard | 📊 | `/admin` | KPI overview |
| Users | 👥 | `/admin/users` | User CRUD |
| Subscriptions | 💳 | `/admin/subscriptions` | Plan & revenue management |
| Configuration | ⚙️ | `/admin/settings` | API keys, system settings |
| Notifications | 🔔 | `/admin/notifications` | Notification center |
| Separator | — | — | Visual divider line |
| Back to app | ↩️ | `/dashboard` | Link back to the user view |

**Behavior**:
- The active item has a `bg-blue-600/20` background + blue left border.
- The notification badge (🔔 3) shows the unread notification count.
- **Mobile responsive**: the sidebar becomes a bottom menu (like a mobile app) or a drawer (slide-in from the left).

### 10.3 `<AdminHeader />`

| Component | Detail |
|---|---|
| `<AdminBreadcrumb />` | Breadcrumb: "Admin > Users > Detail" |
| `<NotificationBell />` | Bell icon with a count badge. Click → dropdown of the last 5 notifications |
| `<AdminUserMenu />` | Admin name + dropdown (My Profile, Back to App, Log out) |

---

## 11. Admin — Analytics Dashboard

**Route**: `/admin`
**Goal**: an instant overview of the app's health.
**Layout**: Bento grid with variously-sized widgets.

### 11.1 `<KPIRow />` (Main KPI Row)

4 KPI cards in a row, each showing a key metric:

| KPI Card | Data | Icon | Color | Detail |
|---|---|---|---|---|
| `<KPICard title="Users">` | Total registered users | 👥 | Blue | Subtext: "+12 this week" (trend). Green ↑ or red ↓ arrow |
| `<KPICard title="Active Subscribers">` | Number of premium subscribers | 💳 | Emerald | Subtext: conversion rate (e.g. "8.2%"). Change vs. previous month |
| `<KPICard title="Monthly Revenue">` | MRR (Monthly Recurring Revenue) | 💰 | Amber | Subtext: "vs. last month +15%". Amount in euros |
| `<KPICard title="Predictions Generated">` | Total AI predictions today | 🧠 | Indigo | Subtext: "42 today". Daily average |

**Structure of a `<KPICard />`**:
```
┌────────────────────┐
│ 👥 Users           │
│                    │
│    1,247           │ ← Main value (text-3xl font-bold)
│    ↑ +12 (0.9%)    │ ← Trend (green if positive, red if negative)
│    this week        │ ← Period (text-xs text-slate-500)
└────────────────────┘
```

### 11.2 `<RevenueChart />`

| Component | Detail |
|---|---|
| Type | Line chart or area chart |
| Data | Monthly revenue (last 12 months) |
| Axes | X: month, Y: amount (€) |
| Toggle | Period filter: "7d / 30d / 90d / 12 months" |
| Size | Large card (2/3 width on desktop) |
| Library | Recharts or Chart.js |

### 11.3 `<UserGrowthChart />`

| Component | Detail |
|---|---|
| Type | Stacked bar chart or line chart |
| Data | Signups per day/week |
| Segments | Free vs Premium (2 colors) |
| Toggle | Period filter: "7d / 30d / 90d" |
| Size | Medium card (1/3 width) |

### 11.4 `<PredictionUsageChart />`

| Component | Detail |
|---|---|
| Type | Donut or pie chart |
| Data | Breakdown by sport (Football / Basketball / Tennis) |
| Sub-data | Total predictions per sport |
| Size | Medium card |

### 11.5 `<RecentActivityFeed />`

Real-time activity feed (scrollable list):

| Event type | Icon | Example |
|---|---|---|
| Signup | 🆕 | "John Smith signed up 5 min ago" |
| Subscription | 💳 | "Mary L. upgraded to Premium — €9.99" |
| Cancellation | ❌ | "Peter M. canceled his subscription" |
| Prediction | 🧠 | "56 predictions generated for Ligue 1" |
| System error | ⚠️ | "API-Sports: quota at 80% — Attention" |

**Behavior**: infinite scroll, the last 20 events shown. Clicking a user event redirects to their user record.

### 11.6 `<SystemHealthWidget />`

| Component | Detail |
|---|---|
| Backend status | 🟢 "Online" or 🔴 "Offline" — automatic ping every 60s |
| API-Sports status | 🟢/🟡/🔴 + quota consumed (e.g. "245/500 requests") |
| Claude API status | 🟢/🟡/🔴 + requests today |
| Stripe status | 🟢/🟡/🔴 + last successful transaction |
| Supabase status | 🟢/🟡/🔴 + DB space used |

---

## 12. Admin — User Management

**Route**: `/admin/users`
**Goal**: full user CRUD. Individual and global views.

### 12.1 `<UsersHeader />`

| Component | Detail |
|---|---|
| Title | "User Management" |
| `<SearchBar />` | Search by name, email, or ID. Real-time search (debounced 300ms) |
| `<FilterDropdown />` | Filters: status (Free / Premium / Canceled) · favorite sport · signup date |
| `<Button variant="primary">` | "+ Add a user" → opens `<CreateUserModal />` |

### 12.2 `<UsersTable />`

Table with sortable columns and pagination.

| Column | Data | Sortable | Detail |
|---|---|---|---|
| Avatar + Name | `user.name` | Yes | 32px avatar + clickable name (→ detail record) |
| Email | `user.email` | Yes | Truncated text if too long |
| Status | `user.subscription_status` | Yes | Colored badge: "Free" (gray), "Premium" (blue), "Canceled" (red) |
| Joined on | `user.created_at` | Yes | Formatted date (e.g. "Feb 11, 2026") |
| Analyses viewed | `user.predictions_viewed` | Yes | Total count |
| Actions | — | No | "⋯" menu: View profile · Edit · Suspend · Delete |

**Pagination**: 20 users per page. Navigation "← 1 2 3 ... 12 →".
**Empty state**: "No users found for this search."

### 12.3 `<UserDetailPanel />` (Slide-in or Dedicated Page)

**Route**: `/admin/users/[id]`
Shows the full profile of a user with every available action.

#### Structure:

| Section | Components | Detail |
|---|---|---|
| **Header** | `<Avatar />` + Name + Email + Status badge | Large profile view |
| **Account Info** | `<InfoGrid />` | ID, signup date, last login, IP, User Agent |
| **Subscription** | `<SubscriptionSummary />` | Current plan, start/end date, Stripe ID, payment history |
| **Activity** | `<UserActivityLog />` | Last 10 actions (logins, predictions viewed, payments) |
| **Preferences** | `<UserPreferences />` | Favorite sports, favorite leagues, language |
| **Admin Actions** | `<AdminActions />` | Action buttons (see below) |

#### Available Admin Actions:

| Action | Button | Effect | Confirmation |
|---|---|---|---|
| Edit profile | ✏️ icon | Opens an inline editable form (name, email) | No |
| Change plan | `<Select>` | Dropdown: Free / Premium / Premium Annual | Modal: "Confirm plan change?" |
| Gift Premium | 🎁 button | Grants X days of free Premium | Modal: number-of-days input |
| Reset password | 🔑 button | Sends a reset email to the user | Modal: "An email will be sent." |
| Suspend account | ⏸️ button | Temporarily disables access | Modal: "Reason for suspension?" + textarea |
| Delete account | 🗑️ button (Danger) | Permanent deletion with DB cascade | **Double confirmation**: "Type DELETE to confirm" |

### 12.4 `<CreateUserModal />`

For manually creating a user (e.g.: partner, tester, VIP).

| Field | Type | Required | Detail |
|---|---|---|---|
| Full name | Text | Yes | — |
| Email | Email | Yes | Real-time uniqueness check |
| Password | Password | Yes | Auto-generated with a "Copy" button OR entered manually |
| Role | Select | Yes | "User" or "Admin" |
| Initial plan | Select | Yes | Free / Premium / Premium Annual |
| Send welcome email | Toggle | No | If enabled, sends an email with credentials |

---

## 13. Admin — Subscription & Revenue Management

**Route**: `/admin/subscriptions`
**Goal**: steer monetization strategy and track revenue.

### 13.1 `<SubscriptionKPIs />`

| KPI | Data | Detail |
|---|---|---|
| MRR | Monthly Recurring Revenue | Total amount of active subscriptions this month |
| Churn Rate | Cancellation rate | % of subscribers canceling this month vs. last month |
| ARPU | Average Revenue Per User | Average revenue per paying user |
| Conversion Rate | Free → Premium | % of free signups who go Premium |

### 13.2 `<PlansManager />`

Editable table of subscription plans.

| Column | Data | Editable | Detail |
|---|---|---|---|
| Plan name | "Premium Monthly" | Yes (inline) | Click to edit the label |
| Price | €9.99/month | Yes (inline) | Edit the price. **Note**: this only changes the display — the Stripe price is authoritative |
| 1st-month promo | €1.00 | Yes (inline) | Amount of the intro offer |
| Stripe Price ID | `price_xxx` | Read-only | Associated Stripe ID. Click to copy |
| Active subscribers | 142 | Read-only | Number of subscribers on this plan |
| Status | Active / Inactive | Yes (Toggle) | Disabling a plan prevents new signups |

**Actions**:
- "Create a new plan" button: opens a form to define a new Stripe plan.

### 13.3 `<SubscriptionsTable />`

List of every individual subscription.

| Column | Data | Detail |
|---|---|---|
| User | Name + Email | Link to user record |
| Plan | Premium / Annual | Colored badge |
| Status | Active / Past Due / Cancelled / Trialing | Badge with semantic color |
| Since | Start date | — |
| Next payment | Date | With expected amount |
| Actions | — | View on Stripe (external link) · Cancel · Gift extension |

### 13.4 `<RevenueBreakdownChart />`

Revenue breakdown chart by plan (Monthly vs. Annual) over the last 12 months. Stacked bar chart.

---

## 14. Admin — System Configuration

**Route**: `/admin/settings`
**Goal**: give the manager full control over technical settings without touching code.

### 14.1 `<SettingsTabs />`

The page is organized into **tabs** grouping settings by category.

| Tab | Label | Content |
|---|---|---|
| API Keys | 🔑 API Keys | Data provider configuration |
| AI | 🧠 Artificial Intelligence | Prediction engine settings |
| App | 📱 Application | General app settings |
| Maintenance | 🔧 Maintenance | Maintenance mode, cache reset |

### 14.2 "API Keys" Tab (`<APIKeysSettings />`)

| Field | Type | Masked | Detail |
|---|---|---|---|
| API-Sports Key | Text (password-like) | Yes (•••••) | "Show" button to toggle. "Test" button to check validity |
| API-Tennis Key | Text (password-like) | Yes | Same. With status indicator (🟢 Valid / 🔴 Invalid) |
| Claude API Key | Text (password-like) | Yes | Same |
| Stripe Secret Key | Text (password-like) | Yes | Same. **Warning** shown: "Only edit this if you know what you're doing" |
| Stripe Webhook Secret | Text (password-like) | Yes | Same |
| Supabase URL | Text | No | Supabase project URL |
| Supabase Service Key | Text (password-like) | Yes | Service (admin) key |

**"Save" button**: saves every changed key. Success/error toast.
**"Test all connections" button**: runs a connectivity test on every API and shows a report (🟢🟢🔴🟢🟢).

### 14.3 "Artificial Intelligence" Tab (`<AISettings />`)

| Setting | Type | Detail |
|---|---|---|
| Active AI model | Select | "Claude Haiku" / "Claude Sonnet" (for the future) |
| Temperature | Slider (0-1) | Controls the AI's creativity. Default: 0.3 (factual). Explanatory tooltip |
| Max tokens | Number input | Max length of the generated analysis. Default: 1500 |
| Cache duration | Number input (minutes) | Prediction cache lifetime. Default: 120min |
| Prompt preview | Textarea (read-only) | Preview of the current prompt (informational — editing happens in code) |

### 14.4 "Application" Tab (`<AppSettings />`)

| Setting | Type | Detail |
|---|---|---|
| App name | Text | "BETIX" — editable (shown in the site title) |
| Free analyses/day | Number (0-10) | Number of predictions offered to Free users. Default: 2 |
| Enabled sports | Checkbox group | ⚽🏀🎾 — allows temporarily disabling a sport |
| Signup mode | Select | "Open" / "Invite-only" / "Closed" |
| Welcome message | Textarea | Custom message shown on the Dashboard (optional, e.g. "Welcome to BETIX!" or a current promo) |
| Support email | Email input | Email address shown in the footer and help pages |

### 14.5 "Maintenance" Tab (`<MaintenanceSettings />`)

| Action | Button | Effect | Confirmation |
|---|---|---|---|
| Maintenance mode | ON/OFF toggle | Shows a "Maintenance in progress" page to all users. Only the admin can navigate | Modal: "Users will no longer be able to access the app." |
| Clear match cache | 🗑️ button | Deletes all cached data and forces a re-fetch | Modal: "This will delete X cached matches." |
| Clear prediction cache | 🗑️ button | Deletes all predictions and forces AI regeneration | Modal: "X predictions will be deleted." |
| Regenerate all predictions | 🔄 button | Triggers AI regeneration for all of today's matches | Modal: "This will consume API quota. Continue?" + progress bar |
| Export data | 📥 button | Exports users + subscriptions as CSV/JSON | Format choice + automatic download |

---

## 15. Admin — Notification Center

**Route**: `/admin/notifications`
**Goal**: centralize every system alert and user message.

### 15.1 `<NotificationTabs />`

| Tab | Label | Content |
|---|---|---|
| System | 🖥️ System | Automatic alerts generated by the application |
| Users | 👤 Users | Messages/requests sent by users |
| History | 📜 History | All past (archived) notifications |

### 15.2 System Notifications (`<SystemNotifications />`)

Automatic alerts generated by the platform:

| Type | Severity | Example | Available action |
|---|---|---|---|
| API quota nearing limit | ⚠️ Warning | "API-Sports: 450/500 requests used today" | Link → Settings > API Keys |
| API quota exceeded | 🔴 Critical | "API-Sports: quota exhausted. No new data until tomorrow" | Link → Settings > API Keys |
| AI error | 🔴 Critical | "Claude API: 429 error (rate limit) for 10 min" | Link → Settings > AI |
| Stripe failure | 🔴 Critical | "Payment failed for user@email.com — Expired card" | Link → user record |
| Signup spike | ℹ️ Info | "+42 signups in 1h (average: 5/h)" | Link → Analytics Dashboard |
| New subscription | ✅ Success | "Mary L. upgraded to Premium (€9.99)" | Link → user record |
| Cancellation | ⚠️ Warning | "Peter M. canceled his subscription" | Link → user record |

**Each notification** has:
- Severity badge (color).
- Timestamp ("5 min ago").
- "Mark as read" button (checkmark icon).
- Contextual action button (link to the relevant page).

### 15.3 User Notifications (`<UserNotifications />`)

Messages sent by users via a future contact form or ticketing system.

| Field | Detail |
|---|---|
| Sender | Name + email (link to user record) |
| Subject | Short text |
| Message | Full text (expandable) |
| Date | Timestamp |
| Status | "New" (blue) / "Read" (gray) / "Replied" (green) |
| Actions | "Reply by email" (opens the mail client) · "Mark as read" · "Archive" |

### 15.4 `<NotificationPreferences />` (Admin Alerts)

The admin can configure which alerts they want to receive and how:

| Setting | Type | Detail |
|---|---|---|
| Critical alerts by email | Toggle | Receives an email for 🔴 Critical alerts |
| Daily summary | Toggle | Receives a recap every morning (new users, revenue, errors) |
| Real-time (in-app) alerts | Toggle | Browser push notifications |

---

## 16. Admin — Detailed Admin Journeys

### 16.1 "Daily Check" Journey (Admin Routine)

```
Log in → /admin (Analytics Dashboard)
  → Scans the 4 KPIs (Users, Subscribers, Revenue, Predictions)
  → Checks the SystemHealthWidget (all APIs 🟢?)
  → Browses the RecentActivityFeed (new signups, payments)
  → If a 🔴 notification → clicks to investigate
  → Back → clicks "↩️ Back to App" to use the app normally
```

### 16.2 "Handle a Problem User" Journey

```
/admin/notifications → sees a user complaint
  → Clicks the sender's name → /admin/users/[id]
  → Reviews the activity history
  → Decision: gift 7 days of free Premium (🎁 button)
  → Or: suspend the account (⏸️ button + reason)
  → Back to notifications → marks as "Replied"
```

### 16.3 "Configure a New API Key" Journey

```
/admin/settings → "API Keys" tab
  → Clicks "Show" on the API-Sports Key
  → Replaces it with the new key
  → Clicks "Test" → result 🟢 "Connection successful"
  → Clicks "Save"
  → Success toast "Configuration updated"
```

### 16.4 "Adjust the Commercial Offer" Journey

```
/admin/subscriptions → PlansManager
  → Changes the 1st-month promo price from €1 to €0 (free offer)
  → Changes the free-analyses count from 2 to 3
    → /admin/settings → App tab → changes "Free analyses/day" to 3
  → Save
  → The changes are immediately reflected on the user side
```

---

## 17. Complete React Component Inventory

### 17.1 Generic UI Components (`/components/ui/`)

| Component | Key Props | Description |
|---|---|---|
| `Button` | `variant`, `size`, `loading`, `disabled` | Primary, Secondary, Ghost, Danger |
| `Input` | `label`, `type`, `error`, `helper` | Form field with label and validation |
| `Badge` | `variant`, `size` | Safe, Warning, Danger, Live, Pro, Admin |
| `Card` | `interactive`, `loading` | Container with border and hover |
| `Tabs` | `items`, `activeTab`, `onChange` | Horizontal tabs |
| `Accordion` | `items` | Expandable FAQ |
| `Modal` | `open`, `onClose`, `title` | Modal dialog |
| `Toast` | `type`, `message`, `duration` | Ephemeral notification |
| `Gauge` | `value`, `max`, `color` | Circular SVG gauge |
| `Skeleton` | `variant` | Animated placeholder |
| `Avatar` | `src`, `name`, `size` | Photo or initials |
| `Toggle` | `checked`, `onChange` | On/off switch |
| `Dropdown` | `options`, `value`, `onChange` | Dropdown menu |
| `ProgressBar` | `value`, `max` | Progress bar |
| `Table` | `columns`, `data`, `sortable`, `pagination` | Table with sort and pagination |
| `SearchBar` | `placeholder`, `onChange`, `debounce` | Search bar with debounce |
| `Breadcrumb` | `items` | Breadcrumb trail |
| `Slider` | `min`, `max`, `step`, `value` | Sliding control |

### 17.2 Business Components — User View (`/components/dashboard/`)

| Component | Description |
|---|---|
| `MatchCard` | Match card (Dashboard grid) |
| `MatchHeader` | Match header (detail page) |
| `PredictionPanel` | Prediction panel (tabs + content) |
| `RiskTabs` | Safe/Value/Risky tabs |
| `PredictionContent` | Content of a prediction |
| `ConfidenceGauge` | Confidence gauge |
| `KeyFactors` | List of key factors |
| `FormChart` | Form chart |
| `H2HHistory` | Head-to-head history |
| `StandingsWidget` | Mini standings |
| `TeamStatsComparison` | Comparative bars |
| `PaywallOverlay` | Premium gate |
| `SportTabs` | Sport filters |
| `LeagueFilter` | League filters |
| `MatchGrid` | Match grid |
| `EmptyState` | Empty state |
| `DemoPredictor` | Landing demo widget |

### 17.3 Landing Components (`/components/landing/`)

| Component | Description |
|---|---|
| `HeroSection` | Hero section with CTA |
| `HowItWorks` | 3-step section |
| `SportShowcaseCard` | Sport card |
| `TestimonialCard` | Testimonial card |
| `PricingPreview` | Pricing preview |
| `AccordionFAQ` | Expandable FAQ |
| `CTABanner` | Final CTA banner |

### 17.4 Auth Components (`/components/auth/`)

| Component | Description |
|---|---|
| `AuthForm` | Reusable login/signup form |
| `OAuthButton` | Social login button |
| `PasswordStrength` | Password strength indicator |
| `OnboardingStepper` | Onboarding stepper |
| `SportSelectionGrid` | Sport selection grid |

### 17.5 Admin Components (`/components/admin/`)

| Component | Description |
|---|---|
| `AdminLayout` | Sidebar + content layout |
| `AdminSidebar` | Admin side navigation |
| `AdminHeader` | Header with breadcrumb + notification bell |
| `KPICard` | Metric card with trend |
| `RevenueChart` | Revenue chart (Line/Area) |
| `UserGrowthChart` | User growth chart |
| `PredictionUsageChart` | Per-sport donut breakdown |
| `RecentActivityFeed` | Real-time activity feed |
| `SystemHealthWidget` | Service health status |
| `UsersTable` | User CRUD table |
| `UserDetailPanel` | Detailed user record |
| `CreateUserModal` | User creation modal |
| `PlansManager` | Editable plans table |
| `SubscriptionsTable` | List of individual subscriptions |
| `APIKeysSettings` | API keys form |
| `AISettings` | AI engine settings |
| `AppSettings` | General settings |
| `MaintenanceSettings` | Maintenance actions |
| `NotificationCenter` | Notification center (system + users) |
| `NotificationPreferences` | Admin alert preferences |
