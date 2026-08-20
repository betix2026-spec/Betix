<div align="center">
  <img src="https://via.placeholder.com/150/000000/FFFFFF/?text=BETIX" alt="Betix Logo" />
  <h1>BETIX AI 📈</h1>
  <p><strong>Premium Sports Analysis & Prediction Platform (AI)</strong></p>
</div>

---

## 📖 Introduction

**BETIX** is a full-stack SaaS application designed to redefine the analytical approach to professional sports betting (Football, Basketball, Tennis). The system ingests large volumes of complex statistical data (rolling form, xG, net rating, H2H) in real time, consolidates it, and hands off the raw analysis to Language Models (LLMs — Anthropic/Gemini) to provide bettors with a Confidence Index and a human-readable narrative ("Expert Opinion").

The architecture is split into two clearly separate ecosystems, designed for performance and asynchronous reliability.

---

## 🏗️ Overall Architecture (The Monorepo)

The repository contains two major components, each living independently and communicating via the database (Supabase).

### 1. 🖥️ The Frontend (Next.js)
Located in `/frontend`. This is the SaaS user portal (dashboard, paywall).
- **Stack**: Next.js 15 (App Router), React, Tailwind CSS, Shadcn UI.
- **Role**: Serve the SEO-optimized landing page, handle MFA authentication via Supabase, process payments with Stripe, and render the AI analysis through a premium, interactive UI.
- **Philosophy**: Strict server-side data fetching (Server Components). Any change to the access flow (Premium Gate) is handled at the root of the layouts so the view is technically blocked.
- **Learn more**: [See the dedicated Frontend documentation](./frontend/README.md).

### 2. 🗄️ The Backend / AI Engine (Python)
Located in `/backend`. This is the data factory (ingestion, radars, artificial intelligence).
- **Stack**: Python 3.12+, FastAPI, Pydantic, httpx (async).
- **Role**: Track the biological clock of sports matches, trigger "in-play" (live) updates, recompute advanced statistics at the end of each match, and orchestrate AI prompts once odds are available.
- **Philosophy**: Asynchronous, unitary multi-workers, guided by orchestrators (Data, Live, AI) built around Supabase's Analytics tables.
- **Learn more**: [See the dedicated Backend documentation](./backend/README.md).

---

## 🧠 Data Infrastructure (Supabase)

Betix is built intensively around **Supabase**, which provides the PostgreSQL database, authentication (including MFA), and permissions.

### Frontend Side
The frontend relies on *Row-Level Security (RLS)* and accesses the database via the anonymous public key to guarantee fine-grained per-user security.

### Backend Side
The backend runs as *System Administrator* (service key / `service_role_key`).
The backend splits its work across two database schemas:
- `public`: the projection of what should be readable by users (matches, profiles, finished AI audits).
- `analytics`: the "black box" where the algorithms live (Elo history, deep head-to-head, pre-match dynamic odds).

---

## 💳 Monetization (Stripe)

Subscription management is centralized end-to-end:
- The end user purchases access via Stripe Checkout (Next.js routing).
- The backend listens for the Supabase webhook at `POST /api/stripe/webhook`.
- On each subscription renewal, the webhook verifies the Stripe signature, extends the `current_period_end` date in the `subscriptions` table, and instantly unlocks the Next.js paywall (thanks to Supabase Realtime/SSR subscriptions).

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js (v20+)
- Python (v3.12+)
- A **Supabase** instance (URL and keys).
- API keys (API-Sports, API-Tennis, Anthropic/Google Gemini, Stripe).

### 1️⃣ Starting the Frontend
```bash
cd frontend
npm install
# Fill in the .env file (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, STRIPE_SECRET_KEY, etc.)
npm run dev
```

### 2️⃣ Starting the Backend
```bash
cd backend
python -m venv venv
# On Windows: venv\Scripts\activate.ps1
# On Mac/Linux: source venv/bin/activate
pip install -r requirements.txt
# Fill in the .env file (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, API_SPORTS_KEY, ANTHROPIC_API_KEY)
# Start the API server (endpoint)
uvicorn app.main:app --host 0.0.0.0 --port 8000
```
*(Note: in production, the backend needs its orchestrators running in parallel for data to stay up to date — see the Backend doc.)*

---

## 🛡️ Contributors & Support
Please make sure to consult both underlying READMEs (Frontend & Backend) before any commit that touches the analytical intelligence (ingestion/rolling form scripts) or the frontend MFA gateways.
