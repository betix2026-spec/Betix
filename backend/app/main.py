"""
BETIX Backend — FastAPI entry point
"""

import logging
from contextlib import asynccontextmanager
from datetime import datetime
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.config import get_settings
from app.routers import matches, predictions, system, audits, webhooks
from app.services.ingestion.orchestrator import IngestionOrchestrator
from scripts.updates.scheduled_audit_pass import run_initial_generation_pass, run_delta_and_poll_pass
from scripts.updates.grade_predictions_pass import run_grading_pass
from scripts.updates.reconcile_public_matches import run_reconciliation

logger = logging.getLogger("app.main")
settings = get_settings()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Startup ---
    logger.info("=== Starting BETIX Backend ===")
    
    # Scheduler configuration
    scheduler = AsyncIOScheduler()
    orchestrator = IngestionOrchestrator()

    # Schedule the live refresh every 5 minutes
    scheduler.add_job(
        orchestrator.run_live_sync,
        "interval",
        minutes=5,
        id="live_match_refresh",
        replace_existing=True
    )

    # Self-healing reconciliation for public.matches — the dashboard's
    # only data source. Twice now (2026-08-21, 2026-08-22), every live/
    # finished/postponed/cancelled row vanished from public.matches
    # entirely while analytics.*_matches stayed correct, with no write
    # path in this codebase found responsible after an exhaustive audit
    # (see reconcile_public_matches.py's module docstring). This doesn't
    # fix whatever's removing the rows — it can't, if the cause is
    # outside this app — but it rebuilds anything missing within 10
    # minutes instead of the gap staying open for up to a day.
    scheduler.add_job(
        run_reconciliation,
        "interval",
        minutes=10,
        id="public_matches_reconciliation",
        replace_existing=True,
        # Fire once immediately on every startup too, not just every 10min
        # from then on — a fresh deploy shouldn't have to wait 10 minutes
        # to repair whatever was missing when it booted.
        next_run_time=datetime.now(),
    )

    # Proactive AI — initial generation: a FIXED-TIME daily job instead of a
    # rolling scan, so every top-tier match kicking off in the next ~24h is
    # submitted together at once. Fixture times are known days ahead
    # (discover_matches.py) and essentially never change with under-24h
    # notice, so there's nothing to gain from re-scanning every 30 minutes
    # — only a worse guarantee for users (a rolling scan means a match's
    # "submitted" moment is effectively random, so a user opening it
    # shortly after has no predictable end to "Analyzing..."). Submitting
    # the whole day's scope together means it all finishes together
    # (typically within ~1h), so anyone checking a couple of hours after
    # this run reliably sees a completed analysis. See
    # scheduled_audit_pass.py's module docstring for the full reasoning.
    scheduler.add_job(
        run_initial_generation_pass,
        "cron",
        hour=0,
        minute=0,
        timezone="Europe/Paris",
        id="ai_audit_initial_pass",
        replace_existing=True,
    )

    # Proactive AI — delta + batch poll: stays on the original 30-minute
    # interval. Polling the football batch queue needs to be frequent (a
    # batch can take up to ~1h, rarely up to 24h) and so does the delta
    # pass itself (~1h before kickoff, every sport). Replaces the old
    # worker_ai (orchestrator_ai.py, retired) which re-analyzed every match
    # up to 16x over 3 days. The safety net remains on-demand generation
    # (routers/audits.py) for anything the initial pass hasn't reached yet.
    scheduler.add_job(
        run_delta_and_poll_pass,
        "interval",
        minutes=30,
        id="ai_audit_delta_and_poll_pass",
        replace_existing=True,
    )

    # Phase 3 grading pass: checks finished matches' audits against the real
    # result and records won/lost/push per pick. Read/DB-only (no AI calls),
    # so it's safe to run on the same cadence as the generation pass.
    scheduler.add_job(
        run_grading_pass,
        "interval",
        minutes=30,
        id="ai_prediction_grading_pass",
        replace_existing=True,
    )

    scheduler.start()
    logger.info(
        "Scheduler (APScheduler) started: live sync every 5min, "
        "public.matches reconciliation every 10min, "
        "AI initial generation daily at 00:00 Europe/Paris, "
        "AI delta+batch-poll every 30min, prediction grading every 30min."
    )
    
    yield
    
    # --- Shutdown ---
    logger.info("=== Stopping BETIX Backend ===")
    scheduler.shutdown()

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="API Backend for BETIX — AI Sports Prediction Platform",
    lifespan=lifespan,
)

# --- CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Health Check ---
@app.get("/api/health")
async def health_check():
    """Server health check."""
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
    }


# --- Routers ---
# app.include_router(sports.router, prefix="/api/sports", tags=["Sports"])
app.include_router(matches.router, prefix="/api/matches", tags=["Matches"])
app.include_router(predictions.router, prefix="/api/predictions", tags=["Predictions"])
app.include_router(system.router, prefix="/api/system", tags=["System"])
app.include_router(audits.router, prefix="/api", tags=["Audits"])
app.include_router(webhooks.router, prefix="/api", tags=["Webhooks"])
