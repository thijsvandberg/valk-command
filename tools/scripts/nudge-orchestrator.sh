#!/usr/bin/env bash
# Smart pipeline nudge for valk-command.
# Checks PR state and spawns the right AO agent for the next step.
# Deduplicates: skips PRs/issues that already have an active session.
# Start: npm run ao:nudge | Stop: Ctrl+C

set -euo pipefail

REPO="thijsvandberg/valk-command"
INTERVAL=${1:-120}

log() { echo "[$(date +%H:%M:%S)] $*"; }

review_count() {
  gh api "repos/$REPO/pulls/$1/reviews" --jq 'length' 2>/dev/null || echo "0"
}

ci_passing() {
  local checks
  checks=$(gh pr checks "$1" --repo "$REPO" 2>/dev/null || echo "")
  echo "$checks" | grep -q "pass" && ! echo "$checks" | grep -q "fail"
}

active_sessions() {
  ao status 2>/dev/null | grep -E "^\s+vc-" | grep -v "exited" || true
}

has_active_session_for_pr() {
  active_sessions | grep -q "#$1"
}

has_active_session_for_issue() {
  active_sessions | grep -q "issue-$1"
}

dependencies_met() {
  local issue=$1
  local body
  body=$(gh issue view "$issue" --repo "$REPO" --json body --jq '.body' 2>/dev/null || echo "")
  local deps
  deps=$(echo "$body" | grep -oE 'Depends on #[0-9]+' | grep -oE '[0-9]+' || true)
  [[ -z "$deps" ]] && return 0
  for dep in $deps; do
    local state
    state=$(gh issue view "$dep" --repo "$REPO" --json state --jq '.state' 2>/dev/null || echo "UNKNOWN")
    if [[ "$state" != "CLOSED" ]]; then
      log "  Issue #$issue blocked by open dependency #$dep"
      return 1
    fi
  done
  return 0
}

send_to_latest_session() {
  local pr=$1; shift
  local prompt="$*"
  sleep 8
  local session
  session=$(active_sessions | grep "#$pr" | awk '{print $1}' | tail -1)
  if [[ -n "$session" ]]; then
    ao send "$session" "$prompt" --no-wait 2>/dev/null || true
    log "  Sent prompt to $session"
  else
    log "  Could not find session for PR #$pr"
  fi
}

process_pr() {
  local pr=$1

  if has_active_session_for_pr "$pr"; then
    log "PR #$pr: agent already active, skipping"
    return
  fi

  if ! ci_passing "$pr"; then
    log "PR #$pr: CI not passing, skipping"
    return
  fi

  local reviews
  reviews=$(review_count "$pr")

  if [[ "$reviews" -lt 1 ]]; then
    log "PR #$pr: needs code review, spawning"
    ao spawn --claim-pr "$pr" 2>/dev/null || { log "PR #$pr: spawn failed"; return; }
    send_to_latest_session "$pr" "You are a code reviewer for valk-command.
First read CLAUDE.md. Then run gh pr diff to read all changes.

Review checklist (evaluate EVERY item):
1. Tests: included for new features/fixes?
2. Commits: conventional format?
3. Secrets: any hardcoded credentials?
4. Types: TypeScript correct?
5. Language: all in English?
6. Scope: changes outside issue scope?
7. Build: run npm run build
8. Tests: run npm run test (if available)

Beyond the checklist, critically review the code.

Format as: ## Checklist (PASS/FAIL per item) ## Review (critical assessment)

Submit: gh pr review $pr --approve -b '<review>' or gh pr review $pr --request-changes -b '<review>'
Do NOT use gh pr comment."

  elif [[ "$reviews" -lt 2 ]]; then
    log "PR #$pr: needs PO acceptance, spawning"
    ao spawn --claim-pr "$pr" 2>/dev/null || { log "PR #$pr: spawn failed"; return; }
    send_to_latest_session "$pr" "You are the PO acceptance agent for valk-command.
Verify PR #$pr delivers what the issue asked for.

1. Find the issue number in the PR body, read it
2. Read the PR diff: gh pr diff
3. Check CI: gh pr checks $pr

Criteria: all AC addressed, no scope creep, CI green, production-ready.

Submit: gh pr review $pr --approve -b 'PO accepted: <summary>' or gh pr review $pr --request-changes -b '<gaps>'
Do NOT use gh pr comment. Do NOT merge."

  else
    log "PR #$pr: reviewed + PO done, spawning merge agent"
    ao spawn --claim-pr "$pr" 2>/dev/null || { log "PR #$pr: spawn failed"; return; }
    send_to_latest_session "$pr" "You are the merge agent for valk-command. Land PR #$pr on dev.

1. git fetch origin dev
2. git rebase origin/dev
3. If conflicts: resolve, run npm run build and npm run test, git rebase --continue
4. git push --force-with-lease
5. Wait for CI: gh pr checks $pr --watch
6. Merge: gh pr merge $pr --squash --delete-branch

If conflicts cannot be resolved, post: gh pr comment $pr -b 'Merge blocked: needs manual resolution.'"
  fi
}

log "Pipeline nudge started (every ${INTERVAL}s). Ctrl+C to stop."

while true; do
  if ! ao status &>/dev/null 2>&1; then
    log "AO not running, skipping"
    sleep "$INTERVAL"
    continue
  fi

  # Process open PRs
  prs=$(gh pr list --repo "$REPO" --base dev --state open --json number 2>/dev/null || echo "[]")
  echo "$prs" | jq -r '.[].number' 2>/dev/null | while read -r pr; do
    [[ -z "$pr" ]] && continue
    process_pr "$pr"
  done

  # Spawn workers for backlog issues (no orchestrator delegation)
  open_issues=$(gh issue list --repo "$REPO" --state open --json number --jq '.[].number' 2>/dev/null || echo "")
  for issue in $open_issues; do
    if has_active_session_for_issue "$issue"; then
      log "Issue #$issue: worker already active, skipping"
      continue
    fi
    if ! dependencies_met "$issue"; then
      continue
    fi
    log "Issue #$issue: spawning worker"
    ao spawn "$issue" 2>/dev/null || { log "Issue #$issue: spawn failed"; continue; }
  done

  sleep "$INTERVAL"
done
