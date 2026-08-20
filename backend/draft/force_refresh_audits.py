"""
BETIX — one-time: force every 'ready' AI audit to be treated as stale.

Why: audits are generated once and served from cache (ai_match_audits,
run_id='live') until they're > STALE_AFTER_HOURS (18h) old — see
app/engine/audit_orchestration.py. The odds-ingestion fix (upsert_odds.py)
landed after many of today's audits were already generated, so those rows
have odds=None baked into their stored analysis and won't refresh on their
own for up to 18h.

This script doesn't regenerate anything itself — it just backdates
`attempted_at` on every 'ready' row so the next ensure_audit() call (the
30-min scheduled pass, or a user opening the match page) sees it as stale
and regenerates it for real, picking up whatever odds now exist.

Run once from the backend's Railway shell:
    python scripts/updates/../../draft/force_refresh_audits.py
or
    python draft/force_refresh_audits.py   (from backend/)
"""
import sys
import os
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST

BACKDATE_HOURS = 19  # > STALE_AFTER_HOURS (18) so _is_stale() is guaranteed True


def main():
    settings = get_settings()
    db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="public")

    rows = db.select_raw("ai_match_audits", "select=id,sport,match_id&status=eq.ready")
    print(f"Found {len(rows)} 'ready' audits.")

    if not rows:
        return

    backdated_at = (datetime.now(timezone.utc) - timedelta(hours=BACKDATE_HOURS)).strftime("%Y-%m-%dT%H:%M:%SZ")

    updated = 0
    for r in rows:
        try:
            db.update("ai_match_audits", {"attempted_at": backdated_at}, {"id": r["id"]})
            updated += 1
        except Exception as e:
            print(f"  ❌ failed for {r['sport']}#{r['match_id']}: {e}")

    print(f"✅ Backdated {updated}/{len(rows)} audits — they'll regenerate with fresh data "
          f"the next time each match is viewed or hit by the 30-min scheduled pass.")


if __name__ == "__main__":
    main()
