#!/usr/bin/env bash
#
# Create a safe, timestamped snapshot of the local SQLite database.
# Uses SQLite's online .backup so it is consistent even while the dev server writes.
#
# Usage:
#   ./tools/scripts/backup-db.sh            # back up the default DB
#   KEEP=20 ./tools/scripts/backup-db.sh    # keep the 20 most recent backups (default 10)
#
set -euo pipefail

# Resolve project root from this script's location, independent of the caller's cwd.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# DB_PATH mirrors drizzle.config.ts; falls back to the default sqlite.db.
DB="${DB_PATH:-sqlite.db}"
BACKUP_DIR="backups"
KEEP="${KEEP:-10}"

if [[ ! -f "$DB" ]]; then
  echo "Database not found: $DB" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
DEST="$BACKUP_DIR/sqlite-$(date +%Y%m%d-%H%M%S).db"

sqlite3 "$DB" ".backup '$DEST'"
echo "Backup created: $DEST ($(du -h "$DEST" | cut -f1))"

# Prune old backups, keeping the KEEP most recent (portable: no mapfile, macOS bash 3.2).
OLD="$(ls -1t "$BACKUP_DIR"/sqlite-*.db 2>/dev/null | tail -n +$((KEEP + 1)))"
if [[ -n "$OLD" ]]; then
  COUNT="$(printf '%s\n' "$OLD" | wc -l | tr -d ' ')"
  printf '%s\n' "$OLD" | xargs rm -f
  echo "Pruned $COUNT old backup(s), keeping $KEEP."
fi
