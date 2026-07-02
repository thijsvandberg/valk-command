#!/usr/bin/env bash
# Runs the production server (`next start`) on :3100 with two things the raw
# command lacks: it frees the port first, and it captures all output to a
# timestamped log file. WHY: `next start` keeps no log of its own, so when the
# process exits mid-use (e.g. an unhandled error in a route) the stacktrace
# scrolls past in the terminal and is lost. A persisted log makes a recurrence
# diagnosable after the fact.
#
# Logs are pruned on every start so the directory can't grow unbounded: keep the
# most recent PROD_LOG_KEEP files and drop anything older than PROD_LOG_MAX_AGE_DAYS.
#
# Tunables (env): PROD_PORT, PROD_LOG_DIR, PROD_LOG_KEEP, PROD_LOG_MAX_AGE_DAYS.
set -uo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
PORT=${PROD_PORT:-3100}
LOG_DIR=${PROD_LOG_DIR:-"$ROOT/logs"}
KEEP=${PROD_LOG_KEEP:-15}
MAX_AGE_DAYS=${PROD_LOG_MAX_AGE_DAYS:-14}

mkdir -p "$LOG_DIR"

# Prune: first by age, then cap the count. Done before starting so a crash loop
# can't leave the dir full. Newest files are kept.
find "$LOG_DIR" -name 'prod-*.log' -type f -mtime +"$MAX_AGE_DAYS" -delete 2>/dev/null
ls -1t "$LOG_DIR"/prod-*.log 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
  rm -f "$old"
done

STAMP=$(date '+%Y%m%d-%H%M%S')
LOG_FILE="$LOG_DIR/prod-$STAMP.log"

# Free the port: a previous `next start` that didn't exit cleanly will still
# hold :PORT and the new one would fail with EADDRINUSE.
lsof -ti:"$PORT" | xargs kill -9 2>/dev/null

# Auto-start VRW when it is down (BRDG-459); warn-and-continue so Bridge boots
# even if VRW fails to start. VRW runs detached and survives Bridge stopping.
bash "$ROOT/tools/scripts/start-vrw.sh" || true

echo "[start-prod] logging to $LOG_FILE (keeping last $KEEP, max ${MAX_AGE_DAYS}d)"
echo "[start-prod] $(date '+%Y-%m-%d %H:%M:%S') starting next start --port $PORT" >"$LOG_FILE"

# tee keeps the live terminal output the user expects while persisting a copy.
# pipefail + ${PIPESTATUS} so the script's exit code reflects next, not tee.
next start --port "$PORT" 2>&1 | tee -a "$LOG_FILE"
exit "${PIPESTATUS[0]}"
