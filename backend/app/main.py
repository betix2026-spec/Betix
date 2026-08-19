"""
BETIX Backend — FastAPI entry point
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.config import get_settings
from app.routers import matches, predictions, system, audits, webhooks
from app.services.ingestion.orchestrator import IngestionOrchestrator
from scripts.updates.scheduled_audit_pass import run_scheduled_pass
from scripts.updates.grade_predictions_pass import run_grading_pass

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

    # Proactive AI pass: generates an analysis ONCE per top-tier match
    # within ~24h of kickoff. Replaces the old worker_ai (orchestrator_ai.py,
    # retired) which re-analyzed every match up to 16x over 3 days. The
    # safety net remains on-demand generation (routers/audits.py) for
    # anything this pass hasn't reached yet.
    scheduler.add_job(
        run_scheduled_pass,
        "interval",
        minutes=30,
        id="ai_audit_proactive_pass",
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
        "proactive AI audits every 30min, prediction grading every 30min."
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
