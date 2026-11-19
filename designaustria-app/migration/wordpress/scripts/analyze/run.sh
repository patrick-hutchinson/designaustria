#!/usr/bin/env bash
# Run all read-only analysis queries against the loaded WordPress DB.
# Output goes to .data/wp-analysis/<name>.txt (gitignored).
# Idempotent: 00-derived.sql rebuilds the scratch schema `wp_analysis`;
# the `wordpress` schema is never modified.
#
# Usage: migration/wordpress/scripts/analyze/run.sh [name-filter]
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$HERE/../../../.." && pwd)"
OUT="$APP_DIR/.data/wp-analysis"
mkdir -p "$OUT"

for f in "$HERE"/*.sql; do
  name="$(basename "$f" .sql)"
  [[ -n "${1:-}" && "$name" != *"$1"* && "$name" != 00-* ]] && continue
  echo "→ $name"
  docker exec -i designaustria-wp-mysql \
    mysql -uroot -pwp wordpress --default-character-set=utf8mb4 --table \
    < "$f" 2>&1 | grep -v "Using a password" > "$OUT/$name.txt"
done
echo "Results in $OUT"
