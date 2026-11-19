#!/usr/bin/env bash
# Load a WordPress SQL export into the throwaway MySQL container.
# Idempotent: drops and recreates the `wordpress` database on every run.
#
# Usage: migration/wordpress/scripts/00-load-dump.sh [path/to/dump.sql]
# Default dump: the newest .data/*wordpress-database_export.sql
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION_DIR="$(dirname "$HERE")"
APP_DIR="$(cd "$MIGRATION_DIR/../.." && pwd)"
COMPOSE=(docker compose -f "$MIGRATION_DIR/docker-compose.yml")
MYSQL=("${COMPOSE[@]}" exec -T wp-mysql mysql -uroot -pwp)

DUMP="${1:-$(ls -t "$APP_DIR"/.data/*wordpress-database_export.sql 2>/dev/null | head -1)}"
if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
  echo "No dump found. Pass a path or put one in $APP_DIR/.data/" >&2
  exit 1
fi

echo "→ Starting MySQL container"
"${COMPOSE[@]}" up -d --wait wp-mysql

echo "→ Recreating database"
"${MYSQL[@]}" -e "DROP DATABASE IF EXISTS wordpress; CREATE DATABASE wordpress CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null

echo "→ Importing $(basename "$DUMP") ($(du -h "$DUMP" | cut -f1))"
"${MYSQL[@]}" --default-character-set=utf8mb4 wordpress < "$DUMP" 2>/dev/null

echo "→ Done. Tables:"
"${MYSQL[@]}" -N wordpress -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='wordpress';" 2>/dev/null
echo "Connect: mysql -h127.0.0.1 -P3307 -uroot -pwp wordpress"
