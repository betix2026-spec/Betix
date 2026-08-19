"""
BETIX — Webhooks Router
Endpoints called by external services (currently: Supabase Database
Webhooks), not by the frontend. Protected by a shared secret passed as a
custom header on the webhook config — see SUPABASE_WEBHOOK_SECRET.
"""

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Header, HTTPException, Request

from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST
from app.services.emailoctopus_client import add_contact

logger = logging.getLogger("betix.webhooks_router")

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])


def _check_webhook_secret(x_webhook_secret: Optional[str]) -> None:
    settings = get_settings()
    expected = settings.SUPABASE_WEBHOOK_SECRET
    if not expected or x_webhook_secret != expected:
        raise HTTPException(status_code=403, detail="Forbidden — webhook endpoint")


def _log_system(level: str, message: str) -> None:
    """Mirrors BaseSportClient._log — writes to public.system_logs so
    failures show up in the admin activity feed, not just server logs."""
    try:
        settings = get_settings()
        db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="public")
        db.insert("system_logs", {"level": level, "source": "emailoctopus", "message": message})
    except Exception as e:
        logger.error(f"Failed to write system_log: {e}")


@router.post("/new-user")
async def new_user_webhook(
    request: Request,
    x_webhook_secret: Optional[str] = Header(None),
) -> Dict[str, Any]:
    """
    Called by a Supabase Database Webhook on INSERT into auth.users.
    Adds the new user's email to the EmailOctopus mailing list.

    Always returns 200 (even on an EmailOctopus failure) so Supabase
    doesn't retry-storm on this — failures are logged instead, both to the
    server log and to public.system_logs for admin visibility.
    """
    _check_webhook_secret(x_webhook_secret)

    payload = await request.json()
    record = payload.get("record") or {}
    email = record.get("email")
    created_at = record.get("created_at")

    if not email:
        logger.warning(f"new-user webhook fired with no email in payload: {payload}")
        return {"ok": False, "reason": "no email in payload"}

    signup_date = created_at[:10] if created_at else None
    success = await add_contact(email, signup_date=signup_date)

    if success:
        _log_system("info", f"Added {email} to EmailOctopus.")
    else:
        _log_system("error", f"Failed to add {email} to EmailOctopus — check server logs.")

    return {"ok": success}
