#!/usr/bin/env bash
# Serialize every vitest run through one lock so a PostToolUse-hook run and a
# manual `npm run test` can never run two vitest processes at once on this 16GB
# machine (BRDG-450). Concurrent vitest processes caused phantom OOM/failures
# that sent sessions down bisect rabbit holes. macOS has no flock, so this uses
# an atomic `mkdir` lock (the same primitive the old inline hook used).
#
# Usage:
#   run-tests.sh wait [vitest args...]   # manual: block until the lock is free
#   run-tests.sh skip [vitest args...]   # hook: skip immediately if locked
# Extra args are forwarded to `vitest run` (e.g. the hook passes --changed).
set -uo pipefail

MODE="${1:-wait}"
shift || true

LOCK="${VALK_TEST_LOCK:-/tmp/valk-vitest.lock}"

# Clear a stale lock left by a crashed/killed run (older than 1 minute).
clear_stale() {
  find "$LOCK" -maxdepth 0 -mmin +1 -exec rm -rf {} \; 2>/dev/null || true
}

clear_stale

if [ "$MODE" = "skip" ]; then
  if ! mkdir "$LOCK" 2>/dev/null; then
    echo "run-tests: another test run is in progress, skipped"
    exit 0
  fi
else
  # Manual runs must complete: block until the lock is free.
  until mkdir "$LOCK" 2>/dev/null; do
    sleep 1
    clear_stale
  done
fi

# Release the lock on any exit, including SIGINT/SIGTERM (e.g. a hook timeout).
trap 'rm -rf "$LOCK"' EXIT INT TERM

npx vitest run "$@"
