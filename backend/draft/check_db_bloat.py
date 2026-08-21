"""
BETIX — check_db_bloat.py
Diagnostic for Osi's "the database is getting bulkier" request. Read-only —
reports row counts and flags specific things known to be orphaned after
tonight's architecture changes, doesn't delete anything. Run this, paste
the output back, and the actual cleanup (migrations to drop columns/rows)
gets scoped from real numbers instead of guesses.

Usage:
    python -m draft.check_db_bloat
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST


def _count_via_header(db: SupabaseREST, table: str, filters: str = "") -> int:
    """select_raw's plain GET doesn't return a row count; PostgREST's
    Content-Range header (with Prefer: count=exact) does."""
    import httpx
    url = f"{db.base_url}/{table}?select=id{('&' + filters) if filters else ''}"
    headers = {**db.headers, "Prefer": "count=exact", "Range": "0-0"}
    try:
        resp = httpx.get(url, headers=headers, timeout=15.0)
        content_range = resp.headers.get("content-range", "")
        if "/" in content_range:
            return int(content_range.split("/")[-1])
    except Exception:
        pass
    return -1


async def main():
    settings = get_settings()
    db_public = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="public")
    db_analytics = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="analytics")

    print("=" * 60)
    print("MIGRATION STATUS — do the 3 pending tables/columns exist?")
    print("=" * 60)
    for table in ("ai_audit_batches", "ai_ondemand_requests"):
        n = _count_via_header(db_public, table)
        print(f"  public.{table}: {'EXISTS, ' + str(n) + ' rows' if n >= 0 else 'MISSING — migration not run'}")

    injuries_ok = True
    try:
        db_public.select_raw("ai_match_audits", "select=injuries&limit=1")
    except Exception:
        injuries_ok = False
    print(f"  public.ai_match_audits.injuries column: {'EXISTS' if injuries_ok else 'MISSING — migration not run'}")

    delta_ok = True
    try:
        db_public.select_raw("ai_match_audits", "select=delta_status&limit=1")
    except Exception:
        delta_ok = False
    print(f"  public.ai_match_audits.delta_status column: {'EXISTS' if delta_ok else 'MISSING — migration not run'}")

    print()
    print("=" * 60)
    print("ai_match_audits — the table this whole engine writes to")
    print("=" * 60)
    total = _count_via_header(db_public, "ai_match_audits")
    live = _count_via_header(db_public, "ai_match_audits", "run_id=eq.live")
    non_live = total - live if total >= 0 and live >= 0 else -1
    print(f"  Total rows: {total}")
    print(f"  run_id='live' (the current row per match, what the app actually reads): {live}")
    print(f"  Everything else — historical dated run_id rows from the old pre-2-call-cap system: {non_live}")
    failed = _count_via_header(db_public, "ai_match_audits", "status=eq.failed")
    print(f"  status='failed' rows (dead weight, safe to purge or ignore): {failed}")

    print()
    print("=" * 60)
    print("system_config — orch_ai.* keys are orphaned (get_sport_config/")
    print("get_ai_schedule, the only readers, were deleted tonight)")
    print("=" * 60)
    orch_ai_keys = db_public.select_raw("system_config", "select=key,value&key=like.orch_ai.*")
    if orch_ai_keys:
        for row in orch_ai_keys:
            print(f"  {row.get('key')} = {row.get('value')}")
    else:
        print("  none found (already clean, or table/schema differs — check manually if this looks wrong)")

    print()
    print("=" * 60)
    print("Biggest tables by row count (top candidates for retention policy)")
    print("=" * 60)
    candidates = [
        ("analytics", "football_matches"), ("analytics", "basketball_matches"), ("analytics", "tennis_matches"),
        ("analytics", "odds_snapshots"), ("analytics", "football_team_rolling"), ("analytics", "basketball_team_rolling"),
        ("analytics", "football_injuries"), ("analytics", "basketball_injuries"),
    ]
    for schema, table in candidates:
        db = db_analytics if schema == "analytics" else db_public
        n = _count_via_header(db, table)
        print(f"  {schema}.{table}: {n if n >= 0 else 'table not found or inaccessible'}")


if __name__ == "__main__":
    asyncio.run(main())
