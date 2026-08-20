"""
BETIX — check_one_audit_shape.py
Dumps one full, raw ai_analysis blob from a graded-but-outcome-less audit,
so its actual structure can be inspected directly instead of inferred from
(contaminated) attempted_at timestamps — see check_grading_zero_verdicts.py,
whose date evidence turned out to be corrupted by force_refresh_audits.py's
earlier backdating of attempted_at on ~1000 rows.

Usage:
    python draft/check_one_audit_shape.py
"""
import sys
import os
import json

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST


def main():
    settings = get_settings()
    db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="public")

    rows = db.select_raw(
        "ai_match_audits",
        "select=id,sport,match_id,attempted_at,ai_provider,ai_model,ai_analysis"
        "&graded_at=not.is.null&limit=1",
    )
    if not rows:
        print("No graded audits found.")
        return

    row = rows[0]
    analysis = row.get("ai_analysis")
    if isinstance(analysis, str):
        analysis = json.loads(analysis)

    print(f"id={row.get('id')} sport={row.get('sport')} match_id={row.get('match_id')}")
    print(f"attempted_at={row.get('attempted_at')} provider={row.get('ai_provider')} model={row.get('ai_model')}")
    print("\nFull ai_analysis:")
    print(json.dumps(analysis, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
