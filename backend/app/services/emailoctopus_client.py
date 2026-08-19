"""
BETIX — EmailOctopus client
Adds a new user's email to the configured EmailOctopus mailing list.
Uses EmailOctopus API v2 (Bearer auth) — https://emailoctopus.com/api-documentation

Failures here must never affect signup itself: this is called from a
webhook handler after the user already exists, purely as a side effect.
"""

import logging
from typing import Optional

import httpx

from app.config import get_settings

logger = logging.getLogger("betix.emailoctopus")

BASE_URL = "https://api.emailoctopus.com"

# EmailOctopus custom field key for the signup date. Must match a custom
# field of type "Date" already created on the target list in the
# EmailOctopus dashboard (List > Fields) — the API silently ignores fields
# that don't exist, it doesn't error, so a typo here fails quietly.
SIGNUP_DATE_FIELD_KEY = "SignupDate"


async def add_contact(email: str, signup_date: Optional[str] = None) -> bool:
    """
    Adds a contact to the configured EmailOctopus list.

    Args:
        email: the contact's email address.
        signup_date: ISO date string (e.g. "2026-08-19"), stored in the
            SIGNUP_DATE_FIELD_KEY custom field if provided.

    Returns:
        True if the contact was added (or already existed), False on a
        real failure.
    """
    settings = get_settings()
    api_key = settings.EMAILOCTOPUS_API_KEY
    list_id = settings.EMAILOCTOPUS_LIST_ID

    if not api_key or not list_id:
        logger.error("EmailOctopus not configured (missing API key or list ID) — skipping.")
        return False

    fields = {}
    if signup_date:
        fields[SIGNUP_DATE_FIELD_KEY] = signup_date

    payload = {
        "email_address": email,
        "status": "SUBSCRIBED",
    }
    if fields:
        payload["fields"] = fields

    url = f"{BASE_URL}/lists/{list_id}/contacts"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
    except Exception as e:
        logger.error(f"EmailOctopus request failed for {email}: {e}")
        return False

    if resp.status_code in (200, 201):
        logger.info(f"EmailOctopus: added {email}.")
        return True

    # A contact that already exists on the list is not a real failure —
    # treat it as success so re-delivered webhooks (or a user who somehow
    # signs up twice) don't spam error logs.
    body_text = resp.text.lower()
    if resp.status_code == 400 and ("already" in body_text or "exist" in body_text):
        logger.info(f"EmailOctopus: {email} already on the list.")
        return True

    logger.error(f"EmailOctopus error for {email}: {resp.status_code} — {resp.text[:300]}")
    return False
