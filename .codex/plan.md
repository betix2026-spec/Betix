# Plan: Supabase Advisory Security Fixes
Date: 2026-07-25
Goal: Fix the urgent Supabase security advisories without breaking existing app flows.

## Steps

### Step 1: Create focused security migration
Goal: Add SQL that enables RLS, tightens policies, revokes public RPC access, and fixes function search paths.
Files: `supabase/migrations/20260725153335_security_advisory_fixes.sql`, `supabase/migrations/20260725153503_move_admin_users_rpc_internal.sql`
Acceptance criteria:
- [x] RLS enabled on `badges`, `app_config`, `ai_match_audits`, `system_logs`.
- [x] Public reads preserved only where needed.
- [x] `system_config` no longer grants all authenticated users full access.
- [x] Internal functions are not executable by `anon` / `authenticated`.
- [x] `get_admin_users_v1()` enforces admin role internally.
- [x] Affected functions have fixed `search_path`.
- [x] Broad public storage listing policy is removed.
Depends on: none

### Step 2: Apply migration to Supabase
Goal: Execute the reviewed SQL against the live project.
Files: database only
Acceptance criteria:
- [x] Migration applies without SQL errors.
- [x] No destructive table/data changes are made.
Depends on: Step 1

### Step 3: Verify advisory delta and app-critical access
Goal: Confirm the critical advisories are cleared or reduced and expected reads/RPC still work.
Files: database only
Acceptance criteria:
- [x] Supabase advisors rerun.
- [x] RLS status is correct for the four tables.
- [x] `get_admin_users_v1()` is no longer anonymous-callable.
- [x] Public reads for `system_config`, `badges`, and `ai_match_audits` remain possible.
Depends on: Step 2
