"""
BETIX — check_api_status.py
Diagnostic: checks whether the configured sports-data API keys
(API_SPORTS_KEY for football/basketball, API_TENNIS_KEY for tennis) are
actually active, and reports subscription/quota info. Read-only, no writes,
safe to run anytime.

Never prints the key values themselves — only account/subscription status.

Usage:
    python check_api_status.py
"""

import asyncio
import sys
import os
import httpx

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app.config import get_settings


def section(title):
    print(f"\n{'='*60}\n  {title}\n{'='*60}")


async def check_api_sports(host: str, label: str, api_key: str):
    section(f"{label} — {host}")
    if not api_key:
        print("  ❌ No API_SPORTS_KEY configured.")
        return

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(f"https://{host}/status", headers={"x-apisports-key": api_key})
            data = resp.json()
    except Exception as e:
        print(f"  ❌ Request failed: {e}")
        return

    if resp.status_code != 200:
        print(f"  ❌ HTTP {resp.status_code}: {data}")
        return

    errors = data.get("errors")
    if errors:
        print(f"  ❌ API returned errors: {errors}")
        return

    account = data.get("response", {})
    subscription = account.get("subscription", {})
    requests_info = account.get("requests", {})

    print(f"  Plan: {subscription.get('plan')}")
    print(f"  Active: {subscription.get('active')}")
    print(f"  Ends at: {subscription.get('end')}")
    print(f"  Requests used today: {requests_info.get('current')} / {requests_info.get('limit_day')}")


async def check_api_tennis(api_key: str, base_url: str):
    section(f"TENNIS — {base_url}")
    if not api_key:
        print("  ❌ No API_TENNIS_KEY configured.")
        return

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(base_url, params={"method": "get_events", "APIkey": api_key})
            data = resp.json()
    except Exception as e:
        print(f"  ❌ Request failed: {e}")
        return

    if resp.status_code != 200:
        print(f"  ❌ HTTP {resp.status_code}: {str(data)[:300]}")
        return

    if not data.get("success"):
        print(f"  ❌ API reports failure: {str(data)[:300]}")
        return

    result = data.get("result", [])
    print(f"  ✅ Success — {len(result)} event type(s) returned.")
    if result:
        print(f"  Sample: {result[:3]}")


async def main():
    settings = get_settings()

    await check_api_sports("v3.football.api-sports.io", "FOOTBALL", settings.API_SPORTS_KEY)
    await check_api_sports("v1.basketball.api-sports.io", "BASKETBALL", settings.API_SPORTS_KEY)
    await check_api_tennis(settings.API_TENNIS_KEY, settings.API_TENNIS_BASE_URL)

    print(f"\n{'='*60}\n  Done.\n{'='*60}")


if __name__ == "__main__":
    asyncio.run(main())
