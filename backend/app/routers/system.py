import json
import re
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Dict, List, Optional
from app.services.ingestion.base_client import SupabaseREST
from app.engine.ai_model import ChatModel
from app.config import get_settings

logger = logging.getLogger("betix.system_router")

router = APIRouter(prefix="/system", tags=["System"])

class SystemConfigItem(BaseModel):
    key: str
    value: str
    description: Optional[str] = None
    updated_at: Optional[str] = None

class SystemConfigUpdate(BaseModel):
    value: str

@router.get("/config", response_model=List[SystemConfigItem])
def get_system_config():
    """Fetch all system configuration."""
    settings = get_settings()
    # Using Service Role to ensure we can read everything
    db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema='public')
    
    rows = db.select('system_config')
    if not rows:
        return []
    return rows

@router.patch("/config/{key}", response_model=SystemConfigItem)
def update_system_config(key: str, update: SystemConfigUpdate):
    """Update a specific configuration value."""
    settings = get_settings()
    db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema='public')
    
    # 1. Check existence
    existing = db.select('system_config', filters={'key': key}, limit=1)
    if not existing:
        raise HTTPException(status_code=404, detail="Config key not found")
        
    # 2. Update
    data = {"value": update.value, "updated_at": "now()"}
    try:
        updated_rows = db.update('system_config', data, {'key': key})
        if not updated_rows:
             raise HTTPException(status_code=500, detail="Update failed")
        return updated_rows[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class TranslateRequest(BaseModel):
    texts: Dict[str, str]  # arbitrary key -> French source text


class TranslateResponse(BaseModel):
    translations: Dict[str, Dict[str, str]]  # key -> {en, es, de}


@router.post("/translate", response_model=TranslateResponse)
async def translate_texts(payload: TranslateRequest):
    """Translate short admin-authored French texts into en/es/de via AI.
    Used for ad-hoc content (e.g. admin notifications) that has no pre-written
    translation, unlike the static UI dictionary in the frontend.
    """
    if not payload.texts:
        return TranslateResponse(translations={})

    settings = get_settings()
    ai = ChatModel(
        provider="claude",
        api_key=getattr(settings, "ANTHROPIC_API_KEY", None),
        model_name="claude-haiku-4-5-20251001",
        temperature=0.3,
        max_tokens=2048,
    )

    prompt = (
        "Translate each of the following French admin-authored texts (short "
        "notification titles and messages for a sports-prediction subscription "
        "app's users) into English, Spanish, and German. Keep the tone plain "
        "and direct, matching the source. Respond with ONLY a JSON object, no "
        "markdown, no commentary, in this exact shape:\n"
        '{ "<key>": { "en": "...", "es": "...", "de": "..." }, ... }\n\n'
        f"Texts to translate:\n{json.dumps(payload.texts, ensure_ascii=False, indent=2)}"
    )

    try:
        raw = await ai.generate_response(message=prompt)
    except Exception as e:
        logger.error(f"Translation AI call failed: {e}")
        raise HTTPException(status_code=502, detail=f"AI translation call failed: {e}")

    if not raw or raw.startswith("Error:"):
        raise HTTPException(status_code=502, detail=f"AI translation call failed: {raw}")

    try:
        translated = json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not match:
            raise HTTPException(status_code=502, detail="Could not parse AI translation response")
        try:
            translated = json.loads(match.group(0))
        except json.JSONDecodeError:
            raise HTTPException(status_code=502, detail="Could not parse AI translation response")

    return TranslateResponse(translations=translated)
