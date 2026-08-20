"""
BETIX — check_odds_and_audit.py
Diagnostic: inspects the actual odds data available for a match, and the
actual ai_analysis content of its most recent audit, to see exactly what
the AI had to work with and what it produced. Read-only.

Usage:
    python draft/check_odds_and_audit.py --sport football --match-id 16524
    (match-id is the INTERNAL id, e.g. from a recent scheduled_audit_pass.py log line)
"""

import argparse
import asyncio
import json
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST


def section(title):
    print(f"\n{'='*60}\n  {title}\n{'='*60}")


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sport", required=True, choices=["football", "basketball", "tennis"])
    parser.add_argument("--match-id", type=int, required=True, help="Internal match id")
    args = parser.parse_args()

    settings = get_settings()
    db_analytics = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="analytics")
    db_public = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="public")

    section(f"ODDS SNAPSHOTS — {args.sport} #{args.match_id}")
    odds_rows = db_analytics.select_raw(
        "odds_snapshots",
        f"match_id=eq.{args.match_id}&sport=eq.{args.sport}"
        "&select=market_name,bookmaker,snapshot_at,odds_data&order=snapshot_at.desc&limit=10",
    )
    if not odds_rows:
        print("  ⚠️ No odds_snapshots rows at all for this match.")
    else:
        print(f"  {len(odds_rows)} snapshot row(s) found:")
        for r in odds_rows:
            print(f"  - {r['market_name']} ({r['bookmaker']}) @ {r['snapshot_at']}: {r['odds_data']}")

    section(f"AI_MATCH_AUDITS — {args.sport} #{args.match_id} (run='live')")
    audit_rows = db_public.select_raw(
        "ai_match_audits",
        f"match_id=eq.{args.match_id}&sport=eq.{args.sport}&run_id=eq.live"
        "&select=status,attempted_at,ai_analysis&limit=1",
    )
    if not audit_rows:
        print("  ⚠️ No 'live' audit row for this match.")
        return

    audit = audit_rows[0]
    print(f"  status: {audit['status']}, attempted_at: {audit['attempted_at']}")

    analysis = audit.get("ai_analysis")
    if isinstance(analysis, str):
        analysis = json.loads(analysis)
    if not analysis:
        print("  ⚠️ ai_analysis is empty.")
        return

    categories = analysis.get("categories", {})
    for cat in ("high_confidence", "medium_confidence", "risky"):
        for item in categories.get(cat, []):
            market = item.get("market", {})
            selection = item.get("selection", {})
            print(
                f"  [{cat}] market={market.get('en') or market.get('fr')!r} "
                f"selection={selection.get('en') or selection.get('fr')!r} "
                f"odds={item.get('odds')!r} outcome={item.get('outcome')}"
            )


if __name__ == "__main__":
    asyncio.run(main())
