# Research Notes: Supabase Security Advisories

Date: 2026-07-25

## Advisory Snapshot
- Supabase project: `pklyygllmbfbdmfmozxq` (`Betix Data Manager`), Postgres 17.
- Security advisories include:
  - RLS disabled on `public.badges`, `public.system_logs`, `public.app_config`, `public.ai_match_audits`.
  - Public execution of `SECURITY DEFINER` functions: `_internal_match_sync`, `get_admin_users_v1`, `get_analytics_schema`, `handle_new_user`.
  - Mutable function `search_path` on sync/trigger/admin helper functions.
  - Public storage bucket `Users` has broad listing policy `Anyone can view avatars`.
  - Auth leaked password protection disabled.

## App Usage
- `public.ai_match_audits` is read by frontend match actions to display latest AI audit for a match.
- `public.badges` is public badge catalog; `public.user_badges` already has public read.
- `public.app_config` appears legacy/static config and can safely be public read only.
- `public.system_logs` is written by backend ingestion clients; no frontend direct reads were found.
- `public.system_config` is read publicly for UI config and updated from admin settings screens via user JWT.
- `get_admin_users_v1()` is called by the admin users page through the browser Supabase client; it needs to remain callable by authenticated users but must enforce admin authorization internally.

## Chosen Security Direction
- Enable RLS on the four exposed tables.
- Preserve expected public reads for catalog/config/audit data, but deny public writes.
- Keep `system_logs` private to admins/service role.
- Remove broad `system_config` all-access policies and keep public read plus admin write.
- Revoke public RPC execution for internal/trigger helpers.
- Keep `get_admin_users_v1()` callable by authenticated users only, with an explicit admin check.
- Set fixed `search_path` values on affected functions.
- Remove the broad storage object listing policy for public bucket `Users`.
