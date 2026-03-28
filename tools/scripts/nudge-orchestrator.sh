#!/usr/bin/env bash
# Periodic nudge loop for the AO orchestrator.
# Reminds it to follow its pipeline rules (review, PO acceptance, backlog).
# Start: npm run ao:nudge | Stop: Ctrl+C

set -euo pipefail

INTERVAL=${1:-120}

echo "Nudge loop started (every ${INTERVAL}s). Ctrl+C to stop."

while true; do
  if ao status &>/dev/null 2>&1; then
    ao send vc-orchestrator "Check ao status. Follow your pipeline rules:
1. For PRs with passing CI and no review: spawn a review agent (ao spawn --claim-pr <number>)
2. For PRs with passing CI and approved code review but no PO acceptance: spawn a PO agent (ao spawn --claim-pr <number>)
3. For open issues without active workers and with dependencies met: spawn a worker (ao spawn <number>)
4. For stuck workers (idle >10min): send a nudge
Act now." --no-wait 2>/dev/null || true
    echo "[$(date +%H:%M:%S)] Nudge sent"
  else
    echo "[$(date +%H:%M:%S)] AO not running, skipping"
  fi
  sleep "$INTERVAL"
done
