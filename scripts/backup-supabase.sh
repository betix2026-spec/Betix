#!/usr/bin/env bash
set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-pklyygllmbfbdmfmozxq}"
REGION="${SUPABASE_REGION:-eu-west-1}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
DB_USER="${SUPABASE_DB_USER:-postgres}"
DB_NAME="${SUPABASE_DB_NAME:-postgres}"
DB_HOST="${SUPABASE_DB_HOST:-db.${PROJECT_REF}.supabase.co}"
DB_PORT="${SUPABASE_DB_PORT:-5432}"

if [[ -x "/opt/homebrew/opt/postgresql@17/bin/pg_dump" ]]; then
  PG_DUMP="/opt/homebrew/opt/postgresql@17/bin/pg_dump"
  PG_DUMPALL="/opt/homebrew/opt/postgresql@17/bin/pg_dumpall"
else
  PG_DUMP="$(command -v pg_dump || true)"
  PG_DUMPALL="$(command -v pg_dumpall || true)"
fi

if [[ -z "$PG_DUMP" || ! -x "$PG_DUMP" ]]; then
  echo "pg_dump is required but was not found on PATH." >&2
  exit 1
fi

if [[ -z "$PG_DUMPALL" || ! -x "$PG_DUMPALL" ]]; then
  echo "pg_dumpall is required but was not found on PATH." >&2
  exit 1
fi

pg_dump_major="$("$PG_DUMP" --version | sed -E 's/.*PostgreSQL\) ([0-9]+).*/\1/')"
if [[ "$pg_dump_major" -lt 17 ]]; then
  echo "pg_dump ${pg_dump_major} was found, but this Supabase project runs PostgreSQL 17." >&2
  echo "Install PostgreSQL 17 client tools or start Docker and use the Supabase CLI dump path." >&2
  echo "On Homebrew: brew install postgresql@17 && export PATH=\"/opt/homebrew/opt/postgresql@17/bin:\$PATH\"" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

if [[ -z "${PGPASSWORD:-}" ]]; then
  read -rsp "Supabase database password for ${DB_USER}@${PROJECT_REF}: " PGPASSWORD
  echo
  export PGPASSWORD
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
base="${BACKUP_DIR}/supabase_${PROJECT_REF}_${timestamp}"
db_url="postgresql://${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=require"

echo "Creating Supabase logical backup for project ${PROJECT_REF} (${REGION})..."

"$PG_DUMP" "$db_url" \
  --schema-only \
  --no-owner \
  --no-privileges \
  --exclude-schema='pg_*' \
  --exclude-schema='information_schema' \
  --exclude-schema='extensions' \
  --exclude-schema='graphql' \
  --exclude-schema='graphql_public' \
  --exclude-schema='net' \
  --exclude-schema='pgbouncer' \
  --exclude-schema='pgsodium' \
  --exclude-schema='pgsodium_masks' \
  --exclude-schema='pgtle' \
  --exclude-schema='repack' \
  --exclude-schema='supabase_functions' \
  --file "${base}_schema.sql"

"$PG_DUMPALL" \
  --dbname "$db_url" \
  --roles-only \
  --no-role-passwords \
  --file "${base}_roles.sql"

"$PG_DUMP" "$db_url" \
  --data-only \
  --no-owner \
  --no-privileges \
  --exclude-schema='pg_*' \
  --exclude-schema='information_schema' \
  --exclude-schema='extensions' \
  --exclude-schema='graphql' \
  --exclude-schema='graphql_public' \
  --exclude-schema='net' \
  --exclude-schema='pgbouncer' \
  --exclude-schema='pgsodium' \
  --exclude-schema='pgsodium_masks' \
  --exclude-schema='pgtle' \
  --exclude-schema='repack' \
  --exclude-schema='supabase_functions' \
  --file "${base}_data.sql"

if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "${base}"_*.sql > "${base}_SHA256SUMS.txt"
elif command -v sha256sum >/dev/null 2>&1; then
  sha256sum "${base}"_*.sql > "${base}_SHA256SUMS.txt"
fi

echo
echo "Backup complete:"
ls -lh "${base}"_*
