# ⚙️ BETIX — Comprehensive Backend Technical Documentation

> **Developer warning**: This document is the absolute source of truth for BETIX's backend architecture. The architecture was designed around an asynchronous, distributed, "unitary" philosophy. Never modify an orchestrator without understanding the impact on the unit scripts it calls.

---

## 🏗️ 1. Architecture & Philosophy

The BETIX backend is not a traditional monolithic API. It's an **ecosystem of workers and data pipelines** built around Python (FastAPI/standalone scripts) and a Supabase database acting as the central nervous system.

### "Unitary" Philosophy
Every script in `scripts/updates/` or `app/engine/` is designed to do **one thing, resiliently**. For example, updating the H2H for one specific match.
These unit scripts are then called by **pipelines** (to chain actions together), which are themselves triggered by **orchestrators** (or radars) based on business rules (time, match state).

### FastAPI (`app/main.py`)
While there is a FastAPI server, its current role is minor compared to the workers. It exposes a few endpoints to dynamically force updates (`/api/v1/trigger/...`) without needing to SSH into the server.

### The Data Layer (Supabase)
All the logic is built on Supabase.
- **`public` schema**: manages users, subscriptions, and data exposed to the frontend (e.g. `ai_match_audits`).
- **`analytics` schema**: the real computation engine. Contains the raw data tables (matches, odds, stats) and computed data (rolling, h2h, elo).
- **Critical table `system_config`**: located in `analytics`, it acts as a live control panel. The orchestrators read it before running, allowing the AI to be switched off or maintenance mode enabled without redeploying code.

---

## 🔑 2. Configuration & Engine

### Critical Environment Variables
The project strictly depends on variables defined in `.env`:
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`: **Critical**. Never expose the `service_role` key. The backend manipulates schemas via this key to bypass RLS (Row Level Security).
- `API_SPORTS_KEY` / `API_TENNIS_KEY`: keys for data ingestion. Heavily used by the workers.
- `ANTHROPIC_API_KEY` / `GEMINI_API_KEY`: for the AI engine.
- `DEBUG` and `ENVIRONMENT`: configure the verbosity level.

---

## 🧠 3. The Background Processes (The Brain)

Three long-running processes, managed by `supervisord` (see `supervisord.conf`), tie the whole system together. A fourth AI worker (`worker_ai`, running the old `orchestrator_ai.py`) existed historically but was retired — see §7.

### `worker_data` → `orchestrator_data.py` (The Daily Clockkeeper)
- **Role**: ensure the database stays up to date over the long term.
- **Actions**:
  1. Runs `DiscoverMatches` (`discover_matches.py`): looks for new matches via the APIs, in a rolling window (default: 10 days back to 10 days forward). Uses `CURRENT_SEASON` from `app/services/ingestion/constants.py` for football/basketball API queries — **this needs bumping by hand once a year** (around when leagues restart their season in August); a stale value causes API-Sports to silently return zero matches instead of erroring.
  2. Runs `DailyMatchOrchestrator` (`process_daily_matches.py`): scans every "not finished" match in a wide window to catch up on postponements or system bugs.
  3. Runs `OddsIngester` (`upsert_odds.py`): batch-downloads odds for upcoming days.
- **Frequency**: configurable via `system_config` (defaults: match discovery roughly every 6h, cleanup pass roughly every 8h).

### `worker_live` → `orchestrator.py` (The Real-Time Operator)
- **Role**: drive the match state machine end-to-end ("live management").
- **Actions**: composes `ImminentRadar`, `LiveSwitchRadar`, and `LiveMatchMonitor`.
- **Frequency**: runs continuously with short async loops (2 to 15 min).

### The `api` process's own scheduled jobs (APScheduler, in `app/main.py`)
The FastAPI process isn't just a thin API layer — it also runs three of its own background jobs via APScheduler, in-process (no separate worker needed):
- **`live_match_refresh`** (every 5 min): `IngestionOrchestrator.run_live_sync()` — refreshes score/status for football and basketball matches already flagged `live`, and syncs the result directly to `public.matches` (not just `analytics`). Tennis isn't wired into this specific job.
- **`ai_audit_proactive_pass`** (every 30 min): see §7 — the current AI generation scheduler.
- **`ai_prediction_grading_pass`** (every 30 min): see §7 — grades finished matches' AI picks against the real result (Phase 3, accuracy tracking).

---

## ⚙️ 4. The State Machine & Live Tracking (Radars)

The evolution of a match's lifecycle (scheduled -> imminent -> live -> finished) is vital. Without this transition, the end-of-match pipelines and the 'Rolling Form' computation never trigger.

### 1. `mark_imminent.py` (H-3 Radar)
- Identifies `scheduled` matches starting in less than 3 hours.
- Checks their exact status with the APIs via the **upserters**.
- Moves their status to `imminent` in the DB.
- If they're oddly already "finished" (e.g. a walkover in tennis), immediately triggers their pipeline.

### 2. `mark_live.py` (M-5 Radar)
- Tracks `imminent` matches within 5 minutes of kickoff.
- Moves the status to `live`.

### 3. `monitor_live.py` (Live Tracking)
- Tracks `live` matches.
- **Repeating action**: calls the API every 2-3 minutes via the upserters to update the score (matches table).
- **The key moment**: when the API reports "Finished" (FT, AET, etc.), it captures the final score and **triggers the end-of-match pipeline** asynchronously (`pipeline_fb.py` or `pipeline_tennis.py`).

### 4. `process_daily_matches.py` (The Safety Net)
- If a match slipped through the live radars (server outage, sports API bug), this script catches it. It takes a D-10 to D+10 window, grabs every `neq.finished` match, and checks its status. If finished, it triggers the pipelines.

---

## 🛠️ 5. The Upserters (Normalization & Ingestion)

These classes fully abstract away the complexity of the external APIs (differing JSON shapes, present/missing keys).

### `upsert_fb_data.py` (Football & Basketball)
- **Statuses**: normalizes API-Sports' dozens of statuses into 5 BETIX statuses: `scheduled`, `imminent`, `live`, `finished`, `postponed`.
- **Scores**: robustly merges scores. E.g. `match["goals"]["home"]` in football becomes `home_score`.

### `upsert_tennis_data.py`
- Handles tennis's specific complexity (no precise match time, depends on what's happening on court before it).
- Attempts to relocate a match on D-1, D+1, D+2 if the API silently moves it.
- Handles counting `sets_played` to gauge players' physical fatigue.

### `upsert_odds.py`
- Fetches pre-match odds (Match Winner, Over/Under, BTTS).
- Works in batches of 50 to avoid API timeouts.
- Writes to `odds_snapshots`. **The AI reads the most recent snapshot at audit time.**

---

## 🏭 6. End-of-Match Pipelines (Analytical Computation)

When a match is flagged "Finished" by a radar, all of its downstream effects on the season's dynamics need recomputing. That's the role of the pipelines (`pipeline_fb.py` and `pipeline_tennis.py`).

They run in a **strict, asynchronous** order (via `subprocess`):

1. **`update_match_stats.py` / `update_tennis_stats.py`**
   - Fetches the match's detailed stats (possession, xG, aces, shooting percentages, etc.) and saves them to the `_match_stats` tables.
2. **`update_match_h2h.py` / `update_tennis_h2h.py`**
   - Recomputes the shared history (head-to-head) between the two opponents. Win counters and mutual goal averages are updated to account for the match that just finished.
3. **`update_match_rolling.py` / `update_tennis_rolling.py`**
   - **The core of the system**. This script recomputes the involved teams' dynamics: "Last 5" (L5), "Last 10" (L10), fatigue, differentials (net rating, xG diff).
   - These rolling metrics are saved into the `_team_rolling` or `_player_rolling` tables, dated today. This snapshot lets the AI analyze the team's next match with up-to-date stats.

---

## 🤖 7. The AI Engine (On-Demand + Proactive)

The old design (`orchestrator_ai.py` / `batch_audit_next_days.py`, a `worker_ai` process re-analyzing every upcoming match up to 16× over a rolling 3-day window) was **retired** — it was re-generating the same matches repeatedly regardless of whether anything had changed, which is what was driving AI costs up. Both scripts, and the `ConfigReader` methods (`get_sport_config()`/`get_ai_schedule()`) that only they used, have since been deleted outright — they'd been dead weight since `worker_ai` was pulled from `supervisord.conf`.

The current design caps every top-tier match at exactly **2** AI calls — an initial analysis ~24h before kickoff and a deliberate "delta" pass ~1h before kickoff — and generates proactively only for top-tier scope, with a rate-limited on-demand path for everything else:

### 1. Proactive pass — `scripts/updates/scheduled_audit_pass.py`
Runs every 30 minutes via APScheduler (`ai_audit_proactive_pass`, in `app/main.py`), doing three scans on every tick:
- **Initial, football** (`LOOKAHEAD_HOURS = 24`): scans `analytics.football_matches` for matches within the next 24 hours in the top-tier scope (`app/engine/tier_scope.py` — Premier League / Ligue 1 / La Liga). Targets that don't already have a fresh/in-flight analysis are submitted as a single **Anthropic Message Batch** (`app/engine/batch_audit.py::submit_pending_batch` — 50% cheaper than the regular Messages API). Every tick also polls any batch already submitted (`poll_and_ingest_batches`) and, once Anthropic marks it `ended`, archives each match's result into `ai_match_audits` exactly like a direct call would.
- **Initial, basketball/tennis**: same 24h window, same tier scope (all 3 tracked leagues for basketball; tennis's "men only" filter can't be enforced yet, there's no tour/gender column in the DB), but calls `ensure_audit()` directly — lower volume, not worth the batch submit/poll complexity.
- **Delta** (`DELTA_LOOKAHEAD_HOURS = 1`), every sport: calls `ensure_delta_audit()` directly, never batched — a batch job can (rarely) take up to 24h, too slow this close to kickoff. No-ops once a delta has already been generated for the match's current live analysis, so this fires exactly once per match too.

### 2. On-demand — `POST /api/audits/{sport}/{match_id}/ensure` (`app/routers/audits.py`)
Called by `requestOnDemandAudit()` (`frontend/src/app/actions/match.ts`) when a premium user clicks "Generate" on a match with no existing analysis yet — never triggered automatically on page load. Every match is generatable this way now; what's rationed is *how often one user can ask* — a rolling 24h cap (`DAILY_ONDEMAND_LIMIT`, 5/day, admins bypass) logged in `public.ai_ondemand_requests` and enforced in the frontend action before this endpoint is ever called, replacing the old hard tier/window ban. Protected by a shared secret (`INTERNAL_API_SECRET`, checked on both the Railway backend and the Vercel frontend — **these two values must match exactly**, or the endpoint silently 403s and the frontend shows an infinite "generating…" state with no visible error). Kicks off generation in the background and returns immediately so the request doesn't hang.

### 3. Read-only stats — `GET /api/audits/{sport}/{match_id}/stats` (`app/routers/audits.py`)
No AI call, no `ai_match_audits` write — just `data_aggregation.py`'s H2H/rolling-stats/odds fetch. Powers the always-on "Preview" tab on the match page, independent of whatever AI state the "Betix AI" tab is in (see `frontend/src/app/actions/match.ts::getMatchStatsOnly`).

### The shared decision logic — `app/engine/audit_orchestration.py`
`ensure_audit()` is the single place both AI triggers go through, so they can never race each other on the same match. It checks `ai_match_audits` for an existing row under `run_id = 'live'` (a single "current" row per match, upserted on every new generation — not a new row per run like the old batch system) and its `status` column:
- `ready` and fresh (< `STALE_AFTER_HOURS` = 30h old — deliberately longer than the ~24h proactive window, so a top-tier match's initial analysis is never accidentally regenerated mid-window; the delta pass is the only deliberate second call) → served as-is, no new generation.
- `pending` and the lock isn't stuck (< 5 min old) → tells the caller to wait; a second concurrent trigger for the same match won't start a second generation.
- `failed`, or a stuck `pending`, or a stale `ready` → regenerates. Every match is eligible now — there's no `allow_generation` scope gate anymore, that's the on-demand caller's rate limit's job instead.

`ensure_delta_audit()` is the equivalent for the ~1h delta pass: requires an existing `ready` base analysis to compare against, and no-ops if `delta_generated_at` is already set.

### The batch submit/poll path — `app/engine/batch_audit.py`
- `submit_pending_batch()`: builds the prompt + archival context (odds/H2H/rolling stats/ceiling) for each target match, locks each one `pending` in `ai_match_audits` (so nothing else regenerates it mid-flight), and submits them as one Anthropic Message Batch. The per-request tracking data is stored in `public.ai_audit_batches.requests` (jsonb) so ingestion doesn't need a second, possibly-stale data fetch.
- `poll_and_ingest_batches()`: checks every `ai_audit_batches` row still `status='submitted'`; once Anthropic reports `processing_status == 'ended'`, walks the results (`succeeded`/`errored`/`canceled`/`expired`), archives each into `ai_match_audits` via the same parse → normalize → clamp pipeline as a direct call (`confidence_generator.parse_ai_response` / `normalize_outcome_fields` / `normalize_language_fields` / `validate_analysis`), and marks the batch row `ingested`.
- No `temperature`/`top_p`/`top_k` on batch requests — the production model (Sonnet 5) rejects `temperature` outright, and there's no equivalent of `ai_model.py`'s interactive retry-without-it inside a batch (a rejected request just comes back `errored` for that one `custom_id`).

### The Unit Resolution Script: `scripts/updates/match_audit_script.py`
This is what `ensure_audit()` (and, for football, `batch_audit.py`) calls to actually run a generation for one match (`run_audit()`).
1. Writes a `pending` lock to `ai_match_audits` (`status='pending'`, `attempted_at=now()`) **before** the AI call, so a concurrent trigger sees the lock immediately.
2. **Calls `data_aggregation.py`**: this class fetches the match's information from about fifteen Supabase tables (match info, odds, H2H, home rolling stats, away rolling stats, referee stats, etc.) and compiles a huge context dictionary.
3. **Filtering**: extracts `essential_stats` so they can be stored in `ai_match_audits` without the JSON blowing up in size.
4. **Prompt & generation** (`confidence_generator.py` & `ai_model.py`): sends the aggregated, textual data to the LLM API (default: Claude Sonnet 5, see `DEFAULT_MODEL` in `confidence_generator.py`) using the sport-specific prompt (defined in `prompt_builder.py`). All 4 languages (fr/en/es/de) are generated in a single call — there's no separate translation pass.
5. **Storing**: upserts the result as `status='ready'` (or `status='failed'` with an `error_message` on failure) into `public.ai_match_audits`. The frontend can then display it.

`run_delta_audit()` follows the same shape for the ~1h delta pass, but writes only the `delta_*` columns (`delta_analysis`, `delta_status`, `delta_generated_at`, `delta_attempted_at`, `delta_error_message`) — it never touches `ai_analysis`/`status`/`attempted_at`, so the original ~24h-out analysis stays intact alongside the delta. Before calling the AI at all it runs `app/engine/delta_gate.py::has_material_change()` — a deterministic (non-LLM) diff of the freshly re-fetched odds/injuries/H2H/rolling-stats against what's stored on the row from the initial pass (`ai_match_audits.injuries`, added for exactly this comparison). If nothing material moved — the common case per the delta prompt's own instructions — the AI call is skipped entirely and `_carry_forward_unchanged()` copies the original analysis into `delta_analysis` with `changed: false`, zero LLM cost. For whatever the filter does flag, the delta prompt (`prompt_builder.DELTA_INSTRUCTIONS`) asks for a **minimal** `{"changed": false}` response when the model itself decides nothing needed updating, instead of re-emitting the full JSON — avoids both the output-token cost and the re-translation-drift risk of asking the model to reproduce content that didn't change (see `confidence_generator.generate_delta_confidence`).

### Prompt caching — `ai_model.py` / `batch_audit.py`
The per-sport system prompts (`FOOTBALL_SYSTEM_PROMPT` etc. in `prompt_builder.py`) are byte-identical across every call for that sport — initial, delta, on-demand, every match — so both call sites send them as a cached content block (`cache_control: {"type": "ephemeral"}`) rather than a plain string: `ai_model.py::ChatModel._generate_claude` for the synchronous path, and each `Request` built by `batch_audit.py::submit_pending_batch` for the football batch (every request in one batch submission shares the same cached system block). Cache hits cost ~0.1× normal input price; a prompt below the model's cacheable-prefix minimum (1024 tokens for Sonnet 5) just silently doesn't cache — no error, no extra cost either.

### Accuracy tracking (Phase 3) — `scripts/updates/grade_predictions_pass.py`
Runs every 30 minutes alongside the proactive pass (`ai_prediction_grading_pass` job). For audits whose match has since finished, checks each pick's structured `outcome` field (e.g. `{"type": "moneyline", "side": "home"}` — attached to every pick specifically so it can be verified automatically, see `prompt_builder.OUTPUT_FORMAT`) against the real final score, via `app/engine/prediction_grading.py`. Results roll up into `grading_results` (won/lost/push/ungraded counts per confidence tier) and power the admin "AI Accuracy" page. Read/DB-only, no AI calls.

---

## 📖 8. Developer Intervention Guide

The project's granularity lets you intervene at different points without breaking anything.

**1. How do I force a stats update for one failed match?**
If the live monitor crashed, just run the scripts manually:
```bash
python scripts/updates/update_match_stats.py --sport football --match-id 112233
python scripts/updates/update_match_rolling.py --sport football --match-id 112233
```
*The script doesn't care about timing, as long as the status is "finished" in the DB.*

**2. How do I change the AI's behavior?**
- **To change what data the AI is given**: edit `app/engine/data_aggregation.py`. If you add a new DB column, this is where you extract it and add it to the dictionary.
- **To change how the AI reasons (tone, structure)**: edit `app/engine/prompt_builder.py`.
- **To change the business output format**: edit the `BetixResponseFormat` Pydantic schema in `prompt_builder.py`.

**3. How do I add support for a new sport (e.g. hockey)?**
1. Create a `HockeyMatchUpserter` class in `scripts/updates/upsert_hockey_data.py` (copy the basketball one).
2. Add the sport to the target dictionaries (e.g. in `process_daily_matches.py`).
3. Create a `pipeline_hockey.py` (copy `pipeline_fb.py`).
4. Write the data context in `data_aggregation.py`.
5. Add the system prompt in `prompt_builder.py`.

**4. Troubleshooting Live**
If matches stay stuck in `live`, check the state of `monitor_live.py`. You can always fix a stuck match directly via the Supabase dashboard by setting it to `finished`, but **remember to trigger its pipeline manually** afterward, or the stats (and the teams' rolling form) won't update.

**5. Diagnostic scripts (`backend/draft/`)**
A handful of read-only diagnostics live here for exactly this kind of troubleshooting — safe to run anytime, none of them write data (except the explicitly-named backfill ones):
- `check_api_status.py` — checks whether the API-Sports and API-Tennis keys are active and reports quota/subscription status, without printing the keys themselves.
- `check_ai_analysis.py` — tests the Anthropic key with a live call and reports the real state of `ai_match_audits` (status breakdown, actual error messages on failed rows).
- `check_odds_and_audit.py` — shows the raw `odds_snapshots` rows and the exact odds value the AI put on each pick for a given match, for tracking down "why does this pick show no odds".
- `backfill_public_matches.py` — one-time sync of existing `analytics.*_matches` rows into `public.matches` (the table the dashboard actually reads). Needed once after any incident that breaks the analytics → public sync, since that sync only fires for newly-discovered matches going forward, not retroactively.

Any standalone script under `scripts/updates/` that imports from `app.*` needs `sys.path.insert(0, ...)` pointing at the project root near the top of the file to be runnable directly (`python scripts/updates/whatever.py`) — it works without that when imported from within the running app (uvicorn already has the project root on `sys.path`), but crashes with `ModuleNotFoundError: No module named 'app'` when invoked directly. Check an existing script (e.g. `discover_matches.py`) for the exact pattern before adding a new one.

**6. Webhooks & external integrations (`app/routers/webhooks.py`)**
Endpoints called by external services, not by the frontend — protected by `SUPABASE_WEBHOOK_SECRET` rather than `INTERNAL_API_SECRET`. Currently one: `POST /api/webhooks/new-user`, called by a Supabase Database Webhook on `auth.users` INSERT, which adds the new user's email to an EmailOctopus mailing list (`app/services/emailoctopus_client.py`). Configured entirely outside this repo — the webhook itself lives in the Supabase dashboard (Database → Webhooks), and needs the `pg_net` extension enabled on the project (Database → Extensions) or it fails to save with a `schema "supabase_functions" does not exist` error.
