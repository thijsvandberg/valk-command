#!/usr/bin/env bash
# Smart pipeline nudge for valk-command.
# Uses ao CLI directly instead of relying on the orchestrator.
# Start: npm run ao:nudge | Stop: Ctrl+C

set -euo pipefail

REPO="thijsvandberg/valk-command"
INTERVAL=${1:-120}
MAX_CODING_WORKERS=2

log() { echo "[$(date +%H:%M:%S)] $*"; }

review_count() {
  gh api "repos/$REPO/pulls/$1/reviews" --jq 'length' 2>/dev/null || echo "0"
}

ci_passing() {
  local state
  state=$(gh pr checks "$1" --repo "$REPO" --json state --jq '.[].state' 2>/dev/null | sort -u)
  [[ "$state" == "SUCCESS" ]]
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
  local pr=$1 prompt=$2
  (
    sleep 20
    local session
    session=$(active_sessions | grep "#$pr" | awk '{print $1}' | tail -1)
    if [[ -n "$session" ]]; then
      ao send "$session" "/model sonnet" --timeout 30 2>/dev/null || true
      sleep 3
      ao send "$session" "$prompt" --timeout 60 2>/dev/null || true
      log "  Sent prompt to $session (sonnet)"
    else
      log "  Could not find session for PR #$pr"
    fi
  ) &
}

spawn_code_review() {
  local pr=$1
  log "PR #$pr: spawning code review"
  ao spawn --claim-pr "$pr" 2>/dev/null || { log "PR #$pr: spawn failed (branch in use?)"; return; }
  send_to_latest_session "$pr" "You are a code reviewer for valk-command.
First read CLAUDE.md for project standards. Then run gh pr diff to read all changes.

Review checklist (evaluate EVERY item):
1. Tests: included for new features/fixes? Name the test files.
2. Commits: conventional format (feat:, fix:, chore:)?
3. Secrets: any hardcoded secrets or credentials?
4. Types: TypeScript correct? Any unwarranted 'any' or type assertions?
5. Language: all code, comments, UI strings in English?
6. Scope: changes outside issue scope?
7. Build: run npm run build
8. Tests: run npm run test (if available)

Beyond the checklist, critically review the code. Bugs? Edge cases? Better approaches?

Format your review as:
## Checklist
Each item with PASS/FAIL.
## Review
Critical assessment.

Submit: gh pr review $pr --approve -b '<review>' or gh pr review $pr --request-changes -b '<review>'
Do NOT use gh pr comment."
}

spawn_po_review() {
  local pr=$1
  log "PR #$pr: spawning PO acceptance"
  ao spawn --claim-pr "$pr" 2>/dev/null || { log "PR #$pr: spawn failed (branch in use?)"; return; }
  send_to_latest_session "$pr" "You are the PO acceptance agent for valk-command.
Verify PR #$pr delivers what the issue asked for.

Steps:
1. Find the issue number in the PR body, then read it: gh issue view <N> --repo $REPO
2. Read the PR diff: gh pr diff
3. Read review comments: gh pr view $pr --comments
4. Check CI: gh pr checks $pr

Criteria:
- All acceptance criteria from the issue addressed
- No scope creep
- CI green
- Production-ready

Submit: gh pr review $pr --approve -b 'PO accepted: <summary>' or gh pr review $pr --request-changes -b '<gaps>'
Do NOT use gh pr comment. Do NOT merge."
}

spawn_merge_agent() {
  local pr=$1
  log "PR #$pr: spawning merge agent"
  ao spawn --claim-pr "$pr" 2>/dev/null || { log "PR #$pr: spawn failed (branch in use?)"; return; }
  send_to_latest_session "$pr" "You are the merge agent for valk-command. Land PR #$pr on dev.

Steps:
1. git fetch origin dev
2. git rebase origin/dev
3. If conflicts: resolve, run npm run build and npm run test, git rebase --continue
4. git push --force-with-lease
5. Wait for CI: gh pr checks $pr --watch
6. Merge: gh pr merge $pr --squash --delete-branch

If conflicts cannot be resolved, post: gh pr comment $pr -b 'Merge blocked: conflicts need manual resolution.'"
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
    spawn_code_review "$pr"
  elif [[ "$reviews" -lt 2 ]]; then
    spawn_po_review "$pr"
  elif [[ "$reviews" -ge 2 ]]; then
    spawn_merge_agent "$pr"
  fi
}

kill_stale_sessions() {
  local now
  now=$(date +%s)
  active_sessions | while read -r line; do
    local session age_str
    session=$(echo "$line" | awk '{print $1}')
    age_str=$(echo "$line" | grep -oE '[0-9]+m ago' | grep -oE '[0-9]+' || echo "")
    [[ -z "$age_str" ]] && continue
    local status
    status=$(echo "$line" | awk '{for(i=1;i<=NF;i++) if($i=="ready"||$i=="idle") print $i}')
    if [[ -n "$status" && "$age_str" -ge 3 ]]; then
      log "Killing stale session $session ($status for ${age_str}m)"
      ao session kill "$session" 2>/dev/null || true
    fi
  done
}

log "Pipeline nudge started (every ${INTERVAL}s). Ctrl+C to stop."

while true; do
  if ! ao status &>/dev/null 2>&1; then
    log "AO not running, skipping"
    sleep "$INTERVAL"
    continue
  fi

  # Cleanup stale worktrees and zombie sessions
  git worktree prune 2>/dev/null || true
  kill_stale_sessions

  # Process open PRs
  prs=$(gh pr list --repo "$REPO" --base dev --state open --json number 2>/dev/null || echo "[]")
  echo "$prs" | jq -r '.[].number' 2>/dev/null | while read -r pr; do
    [[ -z "$pr" ]] && continue
    process_pr "$pr"
  done

  # Spawn workers for backlog issues (max $MAX_CODING_WORKERS concurrent)
  active_worker_count=$(active_sessions | grep -c "issue-" 2>/dev/null || echo "0")
  open_issues=$(gh issue list --repo "$REPO" --state open --json number --jq '.[].number' 2>/dev/null || echo "")
  for issue in $open_issues; do
    if [[ "$active_worker_count" -ge "$MAX_CODING_WORKERS" ]]; then
      log "Worker limit ($MAX_CODING_WORKERS) reached, skipping remaining issues"
      break
    fi
    if has_active_session_for_issue "$issue"; then
      continue
    fi
    if ! dependencies_met "$issue"; then
      continue
    fi
    log "Issue #$issue: spawning worker"
    ao spawn "$issue" 2>/dev/null || { log "Issue #$issue: spawn failed"; continue; }
    active_worker_count=$((active_worker_count + 1))
  done

  sleep "$INTERVAL"
done
