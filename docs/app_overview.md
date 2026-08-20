# BETIX — Complete Application Overview

> **Last updated:** 2026-03-13 (translated and corrected 2026-08-20 to match the shipped system)
> **Version:** v1.0
> **Status:** Production-ready MVP, active development

---

## Table of Contents

1. [General Overview](#1-general-overview)
2. [Project Architecture](#2-project-architecture)
3. [Detailed Tech Stack](#3-detailed-tech-stack)
4. [User Features](#4-user-features)
5. [Admin Features](#5-admin-features)
6. [Data Pipeline (Backend)](#6-data-pipeline-backend)
7. [AI Prediction Engine](#7-ai-prediction-engine)
8. [Database (Dual Schema)](#8-database-dual-schema)
9. [External Integrations](#9-external-integrations)
10. [Payment System (Stripe)](#10-payment-system-stripe)
11. [Authentication & Security](#11-authentication--security)
12. [Deployment & Infrastructure](#12-deployment--infrastructure)
13. [Technical Patterns](#13-technical-patterns)
14. [Key File Tree](#14-key-file-tree)
15. [API Routes (Backend)](#15-api-routes-backend)
16. [Frontend Routes (Pages)](#16-frontend-routes-pages)
17. [Environment Variables](#17-environment-variables)
18. [Related Documentation](#18-related-documentation)

---

## 1. General Overview

**BETIX** is an AI-powered sports prediction SaaS platform. It covers three sports — **Football**, **Basketball**, and **Tennis** — and gives users detailed analysis with confidence scores to guide their betting decisions.

### Value Proposition

- Aggregates **15+ data sources** per match (stats, form, H2H, odds, Elo, referees...)
- **LLM-driven analysis** (Anthropic Claude in production) with sport-specific prompts
- Predictions ranked into **3 confidence tiers** (High Confidence, Medium Confidence, Risky)
- **Real-time** live-match tracking with automatic score updates
- **Freemium** model: limited free predictions/day, unlimited access on premium

---

## 2. Project Architecture

```
BETIX/
├── frontend/                  # Next.js application
│   ├── src/
│   │   ├── app/               # Pages and routes (App Router)
│   │   │   ├── (public)/      # Public pages (landing, pricing, legal)
│   │   │   ├── (auth)/        # Authentication (login, signup, MFA)
│   │   │   ├── (dashboard)/   # Protected dashboard (matches, profile)
│   │   │   ├── (admin)/       # Admin panel
│   │   │   └── api/           # Server routes (Stripe webhook, callbacks)
│   │   ├── components/        # React components (shadcn/ui-based)
│   │   ├── lib/                # Utilities (Supabase, Stripe, API, i18n)
│   │   ├── hooks/              # Custom React hooks
│   │   └── types/              # TypeScript interfaces
│   ├── package.json
│   └── next.config.ts
│
├── backend/                   # Python API & Workers
│   ├── app/
│   │   ├── main.py            # FastAPI entry point (also owns the AI-pass schedulers)
│   │   ├── config.py           # Configuration (Pydantic Settings)
│   │   ├── routers/            # REST API endpoints (incl. webhooks.py)
│   │   ├── models/             # Pydantic schemas & enums
│   │   ├── services/           # Business logic
│   │   │   ├── ingestion/      # Sports API clients
│   │   │   ├── enrichment/     # Analytics (H2H, Rolling, Elo)
│   │   │   ├── emailoctopus_client.py
│   │   │   └── config_reader.py
│   │   └── engine/             # AI pipeline
│   │       ├── ai_model.py     # Claude wrapper
│   │       ├── prompt_builder.py
│   │       ├── data_aggregation.py
│   │       ├── confidence_generator.py
│   │       ├── audit_orchestration.py   # ensure_audit() pending/ready/failed lock
│   │       └── prediction_grading.py     # Phase 3 accuracy tracking
│   ├── scripts/updates/        # Workers & orchestrators
│   ├── draft/                   # One-off diagnostic/backfill scripts (not scheduled)
│   ├── requirements.txt
│   └── supervisord.conf
│
├── supabase/
│   └── migrations/             # PostgreSQL SQL migrations
│
├── docs/                       # Documentation
├── scripts/                    # Utility scripts
├── docker-compose.yml           # Multi-service dev orchestration
└── .env                         # Environment variables
```

---

## 3. Detailed Tech Stack

### Frontend

| Category | Technology | Version / Detail |
|---|---|---|
| Framework | **Next.js** | 16 (App Router, Server Components) |
| Language | **TypeScript** | Strict mode |
| CSS | **Tailwind CSS** | v4 |
| UI components | **shadcn/ui** | Radix UI under the hood |
| Icons | **Lucide React** | |
| Animations | **Framer Motion** | |
| Charts | **Recharts** | Data/stats visualization |
| Notifications | **Sonner** | Toasts |
| Dates | **date-fns** | Formatting and manipulation |
| Payments | **@stripe/stripe-js** | Client-side Stripe SDK |
| Auth/DB | **@supabase/supabase-js** | Supabase client |
| SSR Auth | **@supabase/ssr** | Server-side session handling |
| i18n | Internal (`lib/i18n.ts`) | 4 languages: en/fr/es/de — see `frontend/README.md` §2 |

### Backend

| Category | Technology | Version / Detail |
|---|---|---|
| Language | **Python** | 3.11+ |
| Framework | **FastAPI** | 0.115 |
| Validation | **Pydantic** | v2.12 |
| Scheduler | **APScheduler** | Recurring job scheduling, runs inside the `api` process |
| Async HTTP | **httpx** | Async HTTP client |
| Process manager | **Supervisord** | Multi-worker management in production |
| Config | **Pydantic Settings** | Typed `.env` handling |

### AI / LLM

| Provider | Model | Usage |
|---|---|---|
| **Anthropic** | Claude Haiku 4.5 | Production — the only provider actually wired up |

The original design explored Gemini and GPT as alternatives (see [`FICHE_DIRECTRICE.md`](../FICHE_DIRECTRICE.md)); the shipped engine only calls Claude.

### Database & Services

| Service | Technology | Role |
|---|---|---|
| Database | **PostgreSQL** (via Supabase) | Primary storage |
| Auth | **Supabase Auth** | JWT, MFA, OAuth |
| Realtime | **Supabase Realtime** | Real-time subscriptions |
| Security | **Row-Level Security** | DB-level data protection |

### External APIs

| API | Role | Sports covered |
|---|---|---|
| **API-Sports.io** | Match data, stats, odds | Football, Basketball |
| **API-Tennis** | Tennis match data | Tennis |
| **Stripe** | Payment, subscriptions, webhooks | — |
| **EmailOctopus** | Marketing mailing list sync on signup | — |

---

## 4. User Features

### 4.1 Dashboard

- Real-time match listing, filterable by sport (Football, Basketball, Tennis)
- Live score display during matches
- Responsive, mobile-first match cards
- Navigation by date and league

### 4.2 AI Predictions

Each prediction includes:

- A **confidence score** ranked into 3 tiers, with the score itself assigned by the AI within a fixed range per tier:

| Tier | Range | Description |
|---|---|---|
| **High Confidence** | 80-99 | High confidence, low risk |
| **Medium Confidence** | 60-79 | Moderate confidence |
| **Risky** | 30-59 | Bold picks, higher potential payout |

- An **expert analysis** written in natural language by the LLM (available in all 4 supported languages)
- A structured `outcome` field on every pick (e.g. `{"type": "moneyline", "side": "home"}`), used to automatically grade the pick against the real result once the match finishes (Phase 3 accuracy tracking)
- **Odds** cited only when a real market snapshot exists for that pick — otherwise shown as unavailable rather than a fabricated value
- The main predicted outcome (1X2, Over/Under, etc.)

### 4.3 User Profile

- Personal settings (theme, notifications, newsletter)
- **Betting stats**: win rate, ROI, total profit
- **Gamification**: levels, XP, streaks, badges
- Subscription management and payment history

### 4.4 Subscriptions

| Plan | Access | Price |
|---|---|---|
| **Free** | Limited predictions/day | €0 |
| **Premium monthly** | Unlimited access | Defined in DB |
| **Premium annual** | Unlimited access | Defined in DB |
| **Trial** | Discounted first period | Introductory offer, gated by a one-time-use flag to prevent cancel/resubscribe abuse |

---

## 5. Admin Features

- **User management**: list, detailed records, actions — includes pagination, filters, sort, and a working CSV export
- **Subscription management**: overview, statuses, manual interventions
- **System logs**: full audit trail
- **Notification center**: alerts and communications, including sender identity and a reply action
- **Analytics dashboard**: platform-wide key metrics, backed by real data (not mock/sample data)

---

## 6. Data Pipeline (Backend)

### 6.1 Workers (Supervisord)

The backend runs **3 processes** managed by Supervisord:

| Worker | Script | Role | Frequency |
|---|---|---|---|
| `api` | `main.py` | FastAPI server (port 8000) — also runs the AI-audit and grading passes via its own internal APScheduler | Permanent; internal jobs every 30 min |
| `worker_live` | `orchestrator.py` | Live match tracking | Every 5 min |
| `worker_data` | `orchestrator_data.py` | Daily data sync | Daily |

A fourth worker, `worker_ai` (`orchestrator_ai.py`, batch LLM predictions), has been retired — its job was folded into the `api` process's own scheduled passes (`ai_audit_proactive_pass`, `ai_prediction_grading_pass`), plus an on-demand fallback triggered when a user opens a match with no existing analysis. See §7.

### 6.2 Match State Machine

```
scheduled (D-5/10)
    → imminent (H-3)        # mark_imminent.py
        → live (H-0:05)     # mark_live.py
            → [live tracking]  # monitor_live.py (scores every 2-3 min)
                → finished  # post-match pipeline
```

### 6.3 Ingestion Scripts

| Script | Role |
|---|---|
| `discover_matches.py` | Discovers new matches (D-5 to D-10); also syncs newly-discovered rows into `public.matches` |
| `upsert_fb_data.py` | Football & Basketball data normalization |
| `upsert_tennis_data.py` | Tennis-specific ingestion |
| `upsert_odds.py` | Pre-match odds snapshots (all 3 sports) |

### 6.4 Analytics Enrichment Scripts

| Script | Data produced |
|---|---|
| `update_match_stats.py` | Detailed per-match statistics |
| `update_match_h2h.py` | Head-to-head history |
| `update_match_rolling.py` | Recent form (last 5/10 matches) |
| Tennis equivalents | Tennis-adapted versions of the above |

### 6.5 Post-Match Pipelines

| Script | Sport | Role |
|---|---|---|
| `pipeline_fb.py` | Football/Basketball | Full post-match workflow |
| `pipeline_tennis.py` | Tennis | Tennis-specific workflow |

---

## 7. AI Prediction Engine

### Trigger Model

Two complementary triggers keep predictions fresh without wasting LLM calls on matches nobody will look at:

1. **Proactive pass** (`scheduled_audit_pass.py`, every 30 min): scans top-tier matches within a 24-hour lookahead window and generates analysis ahead of time.
2. **On-demand fallback** (`POST /api/audits/{sport}/{match_id}/ensure`): triggered when a premium user opens a match with no existing analysis — e.g. a lower-tier match, or one just outside the 24h window. Protected by an `INTERNAL_API_SECRET` shared header that must match between the Railway backend and the Vercel frontend.

Both paths go through the same `ensure_audit()` locking logic (`audit_orchestration.py`), which prevents duplicate concurrent generations for the same match and tracks a `status` of pending/ready/failed.

### Full Flow

```
1. Match context aggregation (data_aggregation.py)
   ├── Team/player stats
   ├── Recent form (rolling 5/10 matches)
   ├── H2H (head-to-head)
   ├── Elo ratings
   ├── Referee stats (football)
   ├── Bookmaker odds
   └── League/competition context

2. Prompt construction (prompt_builder.py)
   ├── Sport-specific system prompt
   └── User prompt with structured data
   └── Structured JSON output format: 3 ranked categories
       (high_confidence / medium_confidence / risky, 0-3 picks
       each), each pick carrying market/selection/odds/confidence
       and a structured `outcome` field for auto-grading

3. LLM call (ai_model.py)
   ├── Claude wrapper
   ├── Circuit breaker for rate limiting
   └── Retry with exponential backoff

4. Persistence (Supabase)
   └── Table public.ai_match_audits (single current row per
       match, run_id='live', with status/attempted_at/error_message)

5. Grading pass (prediction_grading.py, every 30 min)
   └── Once a match finishes, grades each pick's stored `outcome`
       against the real result — powers the accuracy-tracking admin page
```

### Retired Components

`orchestrator_ai.py` and `batch_audit_next_days.py` implemented an earlier fixed-batch approach and are no longer scheduled — they remain in the repo, marked `RETIRED` in their file headers, superseded by the proactive+on-demand design above.

---

## 8. Database (Dual Schema)

### `public` Schema (UI-facing data)

| Table | Role |
|---|---|
| `profiles` | User identity, preferences |
| `user_settings` | Theme, notifications, newsletter |
| `user_stats` | Gamification (level, XP, streaks, ROI) |
| `badges` | Badge definitions |
| `user_badges` | Badges unlocked per user |
| `matches` | Match data (sport, teams, scores, status) |
| `ai_match_audits` | AI-generated analysis, confidence tiers, and grading state per match |
| `plans` | Subscription plan definitions |
| `subscriptions` | User subscriptions (`has_used_trial` flag guards against cancel/resubscribe trial abuse) |
| `system_logs` | Audit trail |

### `analytics` Schema (internal AI data)

| Table | Role |
|---|---|
| `*_rolling` | Recent-form statistics |
| `*_h2h` | Head-to-head data |
| `elo_ratings` | Computed strength ranking |
| `referee_stats` | Referee impact |
| `odds_snapshots` | Odds history |
| `*_matches` | Raw per-sport match records (source of truth synced into `public.matches`) |
| `system_config` | Runtime configuration (feature flags) |

### Notable Trigger

The `handle_new_user()` trigger automatically creates, on signup:
- A profile in `profiles`
- Default settings in `user_settings`
- Initial stats in `user_stats`
- A free subscription in `subscriptions`

A signup webhook (`POST /webhooks/new-user`) additionally syncs the new user's email to the EmailOctopus mailing list — see §9.

---

## 9. External Integrations

### API-Sports.io

- **Sports:** Football, Basketball
- **Data:** Fixtures, lineups, detailed stats, odds
- **Plan:** Pro (~$30/month)
- **Leagues covered:** Premier League, La Liga, Ligue 1, Serie A, Bundesliga, NBA, etc.
- **Operational note:** discovery is scoped by a `CURRENT_SEASON` constant that must be bumped manually each year — a stale value silently returns zero matches instead of erroring.

### API-Tennis

- **Sport:** Tennis
- **Specifics:** Flexible schedule handling, player fatigue (sets played), tournaments
- **Data:** Matches, results, rankings
- **Error convention:** returns HTTP 200 even for account-level errors (e.g. non-payment) — the error is embedded in the response body, not the status code, and must be checked explicitly before trusting the response shape.

### Stripe

- Checkout Sessions (secure payment)
- Webhooks (payment and subscription events)
- Customer and subscription management
- Customer portal for self-service

### EmailOctopus

- New signups are synced to a mailing list via a Supabase Database Webhook → `POST /webhooks/new-user`
- Secret-protected via an `X-Webhook-Secret` header
- "Already exists" responses are treated as success, never surfaced as errors

### Supabase

- Managed PostgreSQL
- Auth (JWT, MFA, OAuth)
- Realtime subscriptions
- Row-Level Security
- Secret key (service role) for backend admin access; publishable key for the frontend

---

## 10. Payment System (Stripe)

### Subscription Flow

```
1. User picks a plan (pricing page)
2. Checkout Session created (Next.js API route)
3. Redirect to Stripe Checkout
4. Payment → webhook fired
5. Webhook updates the subscriptions table
6. User redirected to the dashboard
```

### Webhook Events Handled

| Event | Action |
|---|---|
| `checkout.session.completed` | Subscription creation/activation |
| `invoice.paid` | Renewal confirmed |
| `invoice.payment_failed` | Payment failure notification |
| `customer.subscription.deleted` | Subscription deactivation |
| `customer.subscription.updated` | Status update |

### Recent Migration

**Mollie → Stripe** migration (2026-03-12):
- Column renames: `mollie_plan_id` → `stripe_price_id`, `mollie_subscription_id` → `stripe_subscription_id`, `mollie_customer_id` → `stripe_customer_id`
- Updated constraints and defaults

---

## 11. Authentication & Security

### Authentication Methods

- **Email / Password** (standard signup)
- **OAuth** (configurable providers)
- **MFA** (multi-factor authentication)
- Persistent **JWT sessions** via Supabase

### Data Security

- **Row-Level Security (RLS)** on every user-facing table
- **Secret key** (service role) reserved for the backend, never exposed client-side
- **Publishable key** for public frontend operations
- **SECURITY DEFINER** on critical triggers
- Diagnostic scripts never print raw secret values, only aggregate results

---

## 12. Deployment & Infrastructure

### Production

| Service | Platform | Configuration |
|---|---|---|
| **Frontend** | Vercel | Automatic CI/CD from Git, auto-deploy |
| **Backend** | Railway (Docker) | Single image, Supervisord with 3 workers |

### Local Development (Docker Compose)

| Service | Port | Role |
|---|---|---|
| `backend` | 8000 | FastAPI with hot reload |
| `orchestrator` | — | Live-match worker |
| `frontend` | 3000 | Next.js dev server |
| `ngrok` | 4040 | Tunnel for Stripe webhooks |

### Supervisord Configuration (production)

```ini
[program:api]         → FastAPI (port 8000) + internal AI-pass schedulers
[program:worker_live] → orchestrator.py
[program:worker_data] → orchestrator_data.py
```

---

## 13. Technical Patterns

| Pattern | Description |
|---|---|
| **Server Components First** | Next.js maximizes SSR to avoid loading spinners |
| **Async-First** | The entire Python backend is async/await |
| **Circuit Breaker** | Protection against LLM API rate limiting |
| **Webhook-Driven** | Stripe events drive state changes |
| **Dual-Schema** | Separation of UI data (`public`) and AI data (`analytics`) |
| **State Machine** | Matches transition scheduled → imminent → live → finished |
| **Single-responsibility scripts** | Each script does one thing, maximizing composability |
| **RLS-based Security** | Data protection at the PostgreSQL level |
| **Never fake missing data** | Nulls (e.g. no odds snapshot) are rendered as "unavailable," never coerced into a misleading default like 0 |

---

## 14. Key File Tree

### Configuration

| File | Role |
|---|---|
| `docker-compose.yml` | Multi-service orchestration |
| `backend/requirements.txt` | Python dependencies |
| `backend/supervisord.conf` | Production worker configuration |
| `backend/.env.example` | Environment variable template |
| `frontend/package.json` | Node.js dependencies |
| `frontend/next.config.ts` | Next.js configuration |

### Backend — Application Core

| File | Role |
|---|---|
| `backend/app/main.py` | FastAPI entry point |
| `backend/app/config.py` | Centralized configuration |
| `backend/app/routers/` | REST API endpoints |
| `backend/app/models/` | Pydantic schemas & enums |
| `backend/app/services/ingestion/` | Sports API clients |
| `backend/app/services/enrichment/` | Analytics calculations |
| `backend/app/engine/ai_model.py` | Claude wrapper |
| `backend/app/engine/prompt_builder.py` | AI prompt construction |
| `backend/app/engine/data_aggregation.py` | Match context aggregation |
| `backend/app/engine/audit_orchestration.py` | Shared ensure_audit() lock logic |

### Backend — Workers & Orchestrators

| File | Role |
|---|---|
| `backend/scripts/updates/orchestrator.py` | Live match handling |
| `backend/scripts/updates/orchestrator_data.py` | Daily sync |
| `backend/scripts/updates/discover_matches.py` | Match discovery |
| `backend/scripts/updates/scheduled_audit_pass.py` | Proactive 30-min AI-audit pass |
| `backend/scripts/updates/grade_predictions_pass.py` | Phase 3 grading pass |
| `backend/scripts/updates/match_audit_script.py` | Single-match analysis (`run_audit()`) |
| `backend/scripts/updates/orchestrator_ai.py` | **Retired** — folded into the scheduled passes above |
| `backend/scripts/updates/batch_audit_next_days.py` | **Retired** — superseded by the proactive+on-demand design |

### Frontend — Pages

| File | Role |
|---|---|
| `frontend/src/app/(public)/` | Landing, pricing, legal |
| `frontend/src/app/(auth)/` | Login, signup, MFA, reset |
| `frontend/src/app/(dashboard)/` | Dashboard, matches, profile |
| `frontend/src/app/(admin)/` | Admin panel |
| `frontend/src/app/api/stripe/webhook/route.ts` | Stripe webhook |

### Frontend — Libraries

| File | Role |
|---|---|
| `frontend/src/lib/supabase/` | Supabase clients (server/client) |
| `frontend/src/lib/stripe.ts` | Stripe integration |
| `frontend/src/lib/api.ts` | Backend API calls |
| `frontend/src/lib/i18n.ts` | Translation dictionaries and literal-string lookup |
| `frontend/src/components/` | Reusable UI components |

---

## 15. API Routes (Backend)

Routes are organized under `backend/app/routers/`:

- **Matches** — match CRUD, filtering by sport/date/status
- **Audits** — `ensure`/fetch AI analysis per match (on-demand generation)
- **Webhooks** — `new-user` (EmailOctopus sync), Stripe events
- **System** — health check, logs, configuration

---

## 16. Frontend Routes (Pages)

| Route | Access | Description |
|---|---|---|
| `/` | Public | Landing page |
| `/pricing` | Public | Plans and pricing |
| `/login` | Public | Login |
| `/signup` | Public | Signup |
| `/mfa` | Public | MFA verification |
| `/dashboard` | Protected | Main dashboard |
| `/dashboard/matches` | Protected | Match list |
| `/dashboard/match/[id]` | Protected | Match detail + AI analysis |
| `/dashboard/profile` | Protected | User profile |
| `/admin/*` | Admin | Admin panel |
| `/api/stripe/webhook` | Server | Stripe webhook endpoint |

---

## 17. Environment Variables

### Backend

```
APP_NAME, APP_VERSION, DEBUG, FRONTEND_URL
API_SPORTS_KEY, API_TENNIS_KEY
ANTHROPIC_API_KEY
SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
INTERNAL_API_SECRET          # shared with the frontend; guards the on-demand audit endpoint
SUPABASE_WEBHOOK_SECRET      # guards the new-user webhook
EMAILOCTOPUS_API_KEY, EMAILOCTOPUS_LIST_ID
```

### Frontend

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_API_URL
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
INTERNAL_API_SECRET          # must match the backend's value
```

---

## 18. Related Documentation

| Document | Contents |
|---|---|
| `FICHE_DIRECTRICE.md` | Original project charter (business, tech, budget) — historical |
| `docs/functional_specs.md` | Exhaustive UI/UX specifications |
| `docs/database_schemas.md` | Full database design |
| `docs/design_system.md` | Visual guidelines — historical |
| `docs/phase1_synthesis.md` | Phase 1 wrap-up |
| `docs/phase2_synthesis.md` | Phase 2 wrap-up |
| `docs/rag_methodology.md` | Original RAG methodology — historical |
| `backend/README.md` | Current backend architecture (authoritative) |
| `frontend/README.md` | Current frontend architecture (authoritative) |
