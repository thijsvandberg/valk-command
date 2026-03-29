#!/usr/bin/env bash
# Smart pipeline nudge for valk-command.
# Uses ao CLI directly instead of relying on the orchestrator.
# Start: npm run ao:nudge | Stop: Ctrl+C

set -euo pipefail

REPO="thijsvandberg/valk-command"
INTERVAL=${1:-90}
ISSUE_EVERY=${2:-5}  # Check issues every Nth cycle (saves API calls)
MAX_CODING_WORKERS=2
CYCLE=0

# Cached session list (refreshed once per cycle)
CACHED_SESSIONS=""

log() { echo "[$(date +%H:%M:%S)] $*"; }

refresh_sessions() {
  CACHED_SESSIONS=$(ao status 2>/dev/null | grep -E "^\s+vc-" | grep -v "exited" || true)
}

active_sessions() {
  echo "$CACHED_SESSIONS"
}

has_active_session_for_pr() {
  echo "$CACHED_SESSIONS" | grep -q "#$1"
}

has_active_session_for_issue() {
  echo "$CACHED_SESSIONS" | grep -q "issue-$1"
}

# Cached PR list (fetched once per cycle, includes head SHA)
PRS_JSON=""
fetch_all_prs() {
  PRS_JSON=$(gh api "repos/$REPO/pulls?state=open&base=dev&per_page=50" 2>/dev/null || echo "[]")
}

# Get review count + CI status for a PR (2 REST calls, uses cached SHA)
fetch_pr_data() {
  local pr=$1
  local sha reviews ci
  sha=$(echo "$PRS_JSON" | jq -r ".[] | select(.number == $pr) | .head.sha" 2>/dev/null || echo "")
  [[ -z "$sha" ]] && { echo "0 pending"; return; }
  reviews=$(gh api "repos/$REPO/pulls/$pr/reviews" --jq 'length' 2>/dev/null || echo "0")
  ci=$(gh api "repos/$REPO/commits/$sha/check-runs" \
    --jq '[.check_runs[].conclusion] | if all(. == "success") then "success" else "pending" end' 2>/dev/null || echo "pending")
  echo "$reviews $ci"
}

# Fetch all open issues with body + labels in one call (REST API)
# Stores results in ISSUES_JSON for local processing
ISSUES_JSON=""
fetch_all_issues() {
  ISSUES_JSON=$(gh api "repos/$REPO/issues?state=open&per_page=50" 2>/dev/null || echo "[]")
}

issue_model_cached() {
  local issue=$1
  local labels
  labels=$(echo "$ISSUES_JSON" | jq -r ".[] | select(.number == $issue) | .labels[].name" 2>/dev/null || echo "")
  if echo "$labels" | grep -q "model:sonnet"; then
    echo "sonnet"
  else
    echo "opus"
  fi
}

has_open_pr_for_issue() {
  local issue=$1
  # Check if any open PR references this issue (in body or branch name)
  local match
  match=$(echo "$PRS_JSON" | jq -r ".[] | select(.body != null) | select(.body | test(\"#$issue\"; \"i\")) | .number" 2>/dev/null || echo "")
  [[ -n "$match" ]] && return 0
  match=$(echo "$PRS_JSON" | jq -r ".[] | select(.head.ref | test(\"issue-$issue\"; \"i\")) | .number" 2>/dev/null || echo "")
  [[ -n "$match" ]] && return 0
  return 1
}

dependencies_met_cached() {
  local issue=$1
  local body
  body=$(echo "$ISSUES_JSON" | jq -r ".[] | select(.number == $issue) | .body // \"\"" 2>/dev/null || echo "")
  local deps
  deps=$(echo "$body" | grep -oE 'Depends on #[0-9]+' | grep -oE '[0-9]+' || true)
  [[ -z "$deps" ]] && return 0
  for dep in $deps; do
    local dep_state
    dep_state=$(echo "$ISSUES_JSON" | jq -r ".[] | select(.number == $dep) | .state // \"UNKNOWN\"" 2>/dev/null || echo "")
    # If dep not in open issues list, check if it's closed via API (only call if needed)
    if [[ -z "$dep_state" ]]; then
      dep_state=$(gh api "repos/$REPO/issues/$dep" --jq '.state' 2>/dev/null || echo "unknown")
      if [[ "$dep_state" != "closed" ]]; then
        log "  Issue #$issue blocked by open dependency #$dep"
        return 1
      fi
    else
      # It's in the open issues list, so it's open
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
      ao send "$session" "$prompt" --timeout 60 2>/dev/null || true
      log "  Sent prompt to $session"
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

  local pr_data reviews ci
  pr_data=$(fetch_pr_data "$pr")
  reviews=$(echo "$pr_data" | awk '{print $1}')
  ci=$(echo "$pr_data" | awk '{print $2}')

  if [[ "$ci" != "success" ]]; then
    log "PR #$pr: CI not passing ($ci), skipping"
    return
  fi

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

log "Pipeline nudge started (PRs every ${INTERVAL}s, issues every $((INTERVAL * ISSUE_EVERY))s). Ctrl+C to stop."

while true; do
  CYCLE=$((CYCLE + 1))

  if ! ao status &>/dev/null 2>&1; then
    log "AO not running, skipping"
    sleep "$INTERVAL"
    continue
  fi

  # Cache session list once per cycle
  refresh_sessions

  # Cleanup stale worktrees and zombie sessions
  git worktree prune 2>/dev/null || true
  ao session cleanup 2>/dev/null || true
  kill_stale_sessions

  # Refresh sessions after cleanup
  refresh_sessions

  # Always fetch PRs (fast pipeline progression)
  fetch_all_prs

  # Process open PRs
  echo "$PRS_JSON" | jq -r '.[].number' 2>/dev/null | while read -r pr; do
    [[ -z "$pr" ]] && continue
    process_pr "$pr"
  done

  # Check issues less frequently (saves API calls, issues don't change as fast)
  if [[ $((CYCLE % ISSUE_EVERY)) -eq 0 ]]; then
    fetch_all_issues

    # Spawn workers for backlog issues (max $MAX_CODING_WORKERS concurrent)
    active_worker_count=$(echo "$CACHED_SESSIONS" | grep -c "issue-" 2>/dev/null || echo "0")
    # Filter to actual issues (not PRs) from the cached issues JSON
    open_issues=$(echo "$ISSUES_JSON" | jq -r '.[] | select(.pull_request == null) | .number' 2>/dev/null || echo "")
    for issue in $open_issues; do
      if [[ "$active_worker_count" -ge "$MAX_CODING_WORKERS" ]]; then
        log "Worker limit ($MAX_CODING_WORKERS) reached, skipping remaining issues"
        break
      fi
      if has_active_session_for_issue "$issue"; then
        continue
      fi
      if has_open_pr_for_issue "$issue"; then
        log "Issue #$issue: open PR already exists, skipping"
        continue
      fi
      if ! dependencies_met_cached "$issue"; then
        continue
      fi
      model=$(issue_model_cached "$issue")
      log "Issue #$issue: spawning worker ($model)"
      ao spawn "$issue" 2>/dev/null || { log "Issue #$issue: spawn failed"; continue; }
      if [[ "$model" == "sonnet" ]]; then
        (
          sleep 20
          session=$(ao status 2>/dev/null | grep -E "^\s+vc-" | grep "issue-$issue" | awk '{print $1}' | tail -1)
          [[ -n "$session" ]] && ao send "$session" "/model sonnet" --timeout 30 2>/dev/null || true
        ) &
      fi
      active_worker_count=$((active_worker_count + 1))
    done
  fi

  sleep "$INTERVAL"
done
