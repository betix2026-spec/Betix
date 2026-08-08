"""
BETIX Backend — Point d'entrée FastAPI
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.config import get_settings
from app.routers import matches, predictions, system, audits
from app.services.ingestion.orchestrator import IngestionOrchestrator
from scripts.updates.scheduled_audit_pass import run_scheduled_pass

logger = logging.getLogger("app.main")
settings = get_settings()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Startup ---
    logger.info("=== Starting BETIX Backend ===")
    
    # Configuration du Scheduler
    scheduler = AsyncIOScheduler()
    orchestrator = IngestionOrchestrator()
    
    # Planification du rafraîchissement live toutes les 5 minutes
    scheduler.add_job(
        orchestrator.run_live_sync,
        "interval",
        minutes=5,
        id="live_match_refresh",
        replace_existing=True
    )

    # Passage IA proactif : genere une analyse UNE FOIS par match top-tier
    # dans les ~24h avant coup d'envoi. Remplace l'ancien worker_ai
    # (orchestrator_ai.py, retire) qui re-analysait chaque match jusqu'a 16x
    # sur 3 jours. Le filet de securite reste la generation a la demande
    # (routers/audits.py) pour tout ce que ce passage n'a pas encore couvert.
    scheduler.add_job(
        run_scheduled_pass,
        "interval",
        minutes=30,
        id="ai_audit_proactive_pass",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("Planificateur (APScheduler) démarré : live 5min, audits IA proactifs 30min.")
    
    yield
    
    # --- Shutdown ---
    logger.info("=== Stopping BETIX Backend ===")
    scheduler.shutdown()

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="API Backend pour BETIX — Plateforme de Pronostics Sportifs IA",
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
    """Vérification de l'état du serveur."""
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
