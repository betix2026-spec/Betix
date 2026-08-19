"""
BETIX — check_ai_analysis.py
Diagnostic: checks whether the AI analysis pipeline is actually able to
run, and reports the real state of ai_match_audits. Read-only except for
one minimal test call to Anthropic (a handful of tokens, negligible cost).
Never prints the API key itself.

Usage:
    python draft/check_ai_analysis.py
"""

import asyncio
import sys
import os
from collections import Counter

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST


def section(title):
    print(f"\n{'='*60}\n  {title}\n{'='*60}")


async def check_anthropic_key(api_key: str):
    section("ANTHROPIC API KEY")
    if not api_key:
        print("  ❌ ANTHROPIC_API_KEY is not set.")
        return

    try:
        from anthropic import AsyncAnthropic
    except ImportError:
        print("  ❌ 'anthropic' package not installed in this environment.")
        return

    client = AsyncAnthropic(api_key=api_key)
    try:
        resp = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=10,
            messages=[{"role": "user", "content": "Say OK."}],
        )
        text = "".join(b.text for b in resp.content if hasattr(b, "text"))
        print(f"  ✅ Key works. Model responded: {text!r}")
    except Exception as e:
        print(f"  ❌ Call failed: {type(e).__name__}: {e}")


def check_recent_audits(db: SupabaseREST):
    section("RECENT ai_match_audits (last 50 by attempted_at)")
    try:
        rows = db.select_raw(
            "ai_match_audits",
            "select=id,sport,match_id,run_id,status,attempted_at,error_message,graded_at"
            "&order=attempted_at.desc.nullslast&limit=50",
        )
    except Exception as e:
        print(f"  ❌ Query failed: {e}")
        return

    if not rows:
        print("  ⚠️ No rows at all in ai_match_audits.")
        return

    status_counts = Counter(r["status"] for r in rows)
    print(f"  Status breakdown (last 50): {dict(status_counts)}")

    failed = [r for r in rows if r["status"] == "failed"]
    if failed:
        print(f"\n  --- {len(failed)} FAILED row(s), most recent first ---")
        for r in failed[:10]:
            print(f"  [{r['sport']}#{r['match_id']}] run={r['run_id']} at={r['attempted_at']}")
            print(f"    error: {r.get('error_message')}")

    pending = [r for r in rows if r["status"] == "pending"]
    if pending:
        print(f"\n  --- {len(pending)} PENDING row(s) (possibly stuck locks), most recent first ---")
        for r in pending[:10]:
            print(f"  [{r['sport']}#{r['match_id']}] run={r['run_id']} attempted_at={r['attempted_at']}")

    ready = [r for r in rows if r["status"] == "ready"]
    if ready:
        print(f"\n  --- Most recent READY row ---")
        r = ready[0]
        print(f"  [{r['sport']}#{r['match_id']}] run={r['run_id']} attempted_at={r['attempted_at']}")


def check_internal_secret_configured(settings):
    section("INTERNAL_API_SECRET (frontend -> backend trigger auth)")
    if not settings.INTERNAL_API_SECRET:
        print("  ❌ INTERNAL_API_SECRET is empty in this backend's env.")
        print("     If it's also empty/different on the frontend (Vercel), every")
        print("     on-demand generation request gets silently rejected with 403.")
    else:
        print(f"  ✅ Set (length {len(settings.INTERNAL_API_SECRET)} chars). Can't verify it")
        print("     matches Vercel's value from here — check that separately.")


async def main():
    settings = get_settings()

    await check_anthropic_key(settings.ANTHROPIC_API_KEY)

    db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="public")
    check_recent_audits(db)

    check_internal_secret_configured(settings)

    print(f"\n{'='*60}\n  Done.\n{'='*60}")


if __name__ == "__main__":
    asyncio.run(main())
