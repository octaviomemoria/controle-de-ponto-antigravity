#!/usr/bin/env sh
set -eu

DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
REPO_DIR="${REPO_DIR:-$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)}"

apply_sql() {
  file="$1"
  echo "Aplicando $(basename "$file")"
  docker exec -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$file"
}

apply_sql "$REPO_DIR/supabase/schema.sql"
apply_sql "$REPO_DIR/supabase/rls.sql"
apply_sql "$REPO_DIR/supabase/storage.sql"
apply_sql "$REPO_DIR/supabase/migrations/20260711_001_harden_new_user_role.sql"

echo "Banco, RLS e Storage provisionados."

