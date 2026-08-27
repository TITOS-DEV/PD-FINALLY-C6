#!/usr/bin/env bash
#
# Runs the entire database schema in the correct order in a single command:
# tables -> indexes -> triggers -> RLS -> views/procedures -> seed.
# Designed for a fresh Supabase project (or rebuilding schema from scratch) —
# not for re-running on a database that already has this applied (triggers and
# RLS policies are non-idempotent in Postgres; see note below).
#
# Usage:
#   ./database/migrate.sh
#
# Reads DATABASE_URL from .env at repository root (or environment variable).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"

if [ -z "${DATABASE_URL:-}" ]; then
  if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Could not find $ENV_FILE or DATABASE_URL in environment." >&2
    echo "   Copy .env.example to .env at repo root and set DATABASE_URL." >&2
    exit 1
  fi
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d '=' -f2-)"
fi

if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL is empty. Check your .env file." >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "❌ Could not find psql installed. Install it or run these files from Supabase SQL Editor." >&2
  exit 1
fi

# `run <file> <mode>` — "strict" mode stops on first error;
# "lenient" mode is used for non-idempotent files (triggers & RLS policies
# without IF NOT EXISTS) so re-running tolerates "already exists" errors.
run() {
  local file="$1"
  local mode="$2"
  local stop=1
  [ "$mode" = "lenient" ] && stop=0

  echo "▶ $(basename "$file")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP="$stop" -f "$file"
}

run "$SCRIPT_DIR/ddl/tables.sql" strict
run "$SCRIPT_DIR/ddl/indexs.sql" strict
run "$SCRIPT_DIR/functions/triggers.sql" lenient
run "$SCRIPT_DIR/rls/activate_rls.sql" lenient
run "$SCRIPT_DIR/views/view_conversations.sql" strict
run "$SCRIPT_DIR/seeds/seed.sql" strict

echo "✅ Migration + seed applied successfully."
