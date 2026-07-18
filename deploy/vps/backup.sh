#!/usr/bin/env sh
set -eu

DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
BACKUP_DB_USER="${BACKUP_DB_USER:-supabase_admin}"
SUPABASE_DIR="${SUPABASE_DIR:-/opt/controle-ponto/supabase-project}"
BACKUP_DIR="${BACKUP_DIR:-/opt/backups/controle-ponto}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$BACKUP_DIR"
docker exec "$DB_CONTAINER" pg_dump -U "$BACKUP_DB_USER" -d postgres --format=custom \
  > "$BACKUP_DIR/postgres-$STAMP.dump"

if [ -d "$SUPABASE_DIR/volumes/storage" ]; then
  tar -C "$SUPABASE_DIR/volumes" -czf "$BACKUP_DIR/storage-$STAMP.tar.gz" storage
fi

find "$BACKUP_DIR" -type f -mtime "+$RETENTION_DAYS" -delete
echo "Backup concluído: $STAMP"
