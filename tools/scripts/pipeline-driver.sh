#!/usr/bin/env bash
# Event-driven pipeline driver for valk-command.
#
# Three cadences:
#   - Every 5s: process trigger files from .ao-events/ (written by metadata-updater hook)
#   - Every 60s: kill stale (ready/idle 3+ min) sessions
#   - Every FALLBACK_INTERVAL: sweep for stale PRs, spawn issue workers, cleanup
#
# Start: npm run ao:nudge | Stop: Ctrl+C

set -euo pipefail

REPO="thijsvandberg/valk-command"
EVENT_POLL=5
FALLBACK_INTERVAL=${1:-300}
ISSUE_EVERY=${2:-3}  # Check issues every Nth fallback cycle
MAX_CODING_WORKERS=2
FALLBACK_STALE_THRESHOLD=600  # 10 min before fallback kicks in for PRs

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
EVENTS_DIR="$PROJECT_ROOT/.ao-events"
PROCESSED_DIR="$EVENTS_DIR/processed"
FAILED_DIR="$EVENTS_DIR/failed"

CYCLE=0
LAST_FALLBACK=0
LAST_KILL_CHECK=0
KILL_CHECK_INTERVAL=60
FALLBACK_CYCLE=0

# Cached data (refreshed during fallback sweeps)
CACHED_SESSIONS=""
PRS_JSON=""
ISSUES_JSON=""

log() { echo "[$(date +%H:%M:%S)] $*"; }

# ============================================================================
# Session helpers
# ============================================================================

refresh_sessions() {
  CACHED_SESSIONS=$(ao status 2>/dev/null | grep -E "^\s+vc-" | grep -v "exited" || true)
}

has_active_session_for_pr() {
  echo "$CACHED_SESSIONS" | grep -q "#$1" 2>/dev/null
}

has_active_session_for_issue() {
  echo "$CACHED_SESSIONS" | grep -q "issue-$1" 2>/dev/null
}

# ============================================================================
# Agent prompts
# ============================================================================

send_to_latest_session() {
  local pr=$1 prompt=$2
  (
    sleep 20
    refresh_sessions
    local session
    session=$(echo "$CACHED_SESSIONS" | grep "#$pr" | awk '{print $1}' | tail -1)
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
  ao spawn --claim-pr "$pr" 2>/dev/null || { log "PR #$pr: spawn failed (branch in use?)"; return 1; }
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
  ao spawn --claim-pr "$pr" 2>/dev/null || { log "PR #$pr: spawn failed (branch in use?)"; return 1; }
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
  ao spawn --claim-pr "$pr" 2>/dev/null || { log "PR #$pr: spawn failed (branch in use?)"; return 1; }
  send_to_latest_session "$pr" "You are the merge agent for valk-command. Land PR #$pr on dev.

Steps:
1. git fetch origin dev
2. git rebase origin/dev
3. If conflicts: resolve, run npm run build and npm run test, git rebase --continue
4. git push --force-with-lease
5. Merge: gh pr merge $pr --squash --delete-branch

If conflicts cannot be resolved, post: gh pr comment $pr -b 'Merge blocked: conflicts need manual resolution.'"
}

# ============================================================================
# Event processing
# ============================================================================

extract_pr_number() {
  local pr_url=$1
  echo "$pr_url" | grep -oE '[0-9]+$' || echo ""
}

process_trigger() {
  local trigger_file=$1
  local event="" pr="" session="" timestamp="" branch=""

  # Parse trigger file
  while IFS='=' read -r key value; do
    case "$key" in
      event) event="$value" ;;
      pr) pr="$value" ;;
      session) session="$value" ;;
      timestamp) timestamp="$value" ;;
      branch) branch="$value" ;;
    esac
  done < "$trigger_file"

  local pr_number
  pr_number=$(extract_pr_number "$pr")

  log "Event: $event (PR #$pr_number, session $session)"

  # Refresh sessions for dedup check
  refresh_sessions

  case "$event" in
    pr_created)
      if [[ -z "$pr_number" ]]; then
        log "  No PR number, skipping"
        return 0
      fi
      if has_active_session_for_pr "$pr_number"; then
        log "  PR #$pr_number: agent already active, skipping"
        return 0
      fi
      spawn_code_review "$pr_number" || return 1
      ;;

    review_approved)
      if [[ -z "$pr_number" ]]; then
        log "  No PR number, skipping"
        return 0
      fi
      if has_active_session_for_pr "$pr_number"; then
        log "  PR #$pr_number: agent already active, skipping"
        return 0
      fi
      # Check review count to determine next stage
      local reviews
      reviews=$(gh api "repos/$REPO/pulls/$pr_number/reviews" --jq 'length' 2>/dev/null || echo "0")
      if [[ "$reviews" -lt 2 ]]; then
        spawn_po_review "$pr_number" || return 1
      else
        spawn_merge_agent "$pr_number" || return 1
      fi
      ;;

    review_changes_requested)
      log "  Changes requested, no pipeline action (lifecycle manager handles)"
      ;;

    pr_merged)
      log "  PR merged, monitoring post-merge CI"
      ;;

    pr_pushed)
      log "  Push detected, no immediate action"
      ;;

    *)
      log "  Unknown event: $event"
      ;;
  esac

  return 0
}

process_events() {
  [[ ! -d "$EVENTS_DIR" ]] && return

  local trigger_files
  trigger_files=$(find "$EVENTS_DIR" -maxdepth 1 -name "*.trigger" -type f 2>/dev/null | sort || true)
  [[ -z "$trigger_files" ]] && return

  mkdir -p "$PROCESSED_DIR" "$FAILED_DIR"

  local now
  now=$(date +%s)

  while IFS= read -r trigger_file; do
    [[ -z "$trigger_file" ]] && continue

    # Check age for retry/fail logic
    local file_timestamp
    file_timestamp=$(basename "$trigger_file" | grep -oE '^[0-9]+' || echo "0")
    local age=$(( now - file_timestamp ))

    if process_trigger "$trigger_file"; then
      mv "$trigger_file" "$PROCESSED_DIR/" 2>/dev/null || true
    else
      if [[ "$age" -gt 120 ]]; then
        log "  Trigger failed after 2 min, moving to failed/"
        mv "$trigger_file" "$FAILED_DIR/" 2>/dev/null || true
      else
        log "  Trigger failed, will retry next cycle"
      fi
    fi
  done <<< "$trigger_files"
}

# ============================================================================
# Post-merge CI monitoring
# ============================================================================

check_postmerge_ci() {
  local latest_run
  latest_run=$(gh run list --branch dev --limit 1 --json conclusion,headSha,displayTitle,databaseId 2>/dev/null || echo "[]")
  local conclusion
  conclusion=$(echo "$latest_run" | jq -r '.[0].conclusion // "pending"' 2>/dev/null || echo "pending")

  if [[ "$conclusion" == "failure" ]]; then
    local title sha run_id
    title=$(echo "$latest_run" | jq -r '.[0].displayTitle // "unknown"' 2>/dev/null)
    sha=$(echo "$latest_run" | jq -r '.[0].headSha // "unknown"' 2>/dev/null)
    run_id=$(echo "$latest_run" | jq -r '.[0].databaseId // ""' 2>/dev/null)
    log "POST-MERGE CI FAILED on dev: $title ($sha)"
    # Desktop notification
    osascript -e "display notification \"CI failed on dev: $title\" with title \"valk-command pipeline\"" 2>/dev/null || true
  fi
}

# ============================================================================
# Fallback sweep (replaces the old nudge primary loop)
# ============================================================================

fetch_all_prs() {
  PRS_JSON=$(gh api "repos/$REPO/pulls?state=open&base=dev&per_page=50" 2>/dev/null || echo "[]")
}

fetch_pr_data() {
  local pr=$1
  local sha reviews
  sha=$(echo "$PRS_JSON" | jq -r ".[] | select(.number == $pr) | .head.sha" 2>/dev/null || echo "")
  [[ -z "$sha" ]] && { echo "0"; return; }
  reviews=$(gh api "repos/$REPO/pulls/$pr/reviews" --jq 'length' 2>/dev/null || echo "0")
  echo "$reviews"
}

pr_created_at() {
  local pr=$1
  echo "$PRS_JSON" | jq -r ".[] | select(.number == $pr) | .created_at // \"\"" 2>/dev/null || echo ""
}

fallback_sweep_prs() {
  log "Fallback: checking PRs"
  fetch_all_prs

  local now
  now=$(date +%s)

  echo "$PRS_JSON" | jq -r '.[].number' 2>/dev/null | while read -r pr; do
    [[ -z "$pr" ]] && continue

    if has_active_session_for_pr "$pr"; then
      continue
    fi

    # Only act on PRs older than threshold (events should have handled fresh ones)
    local created_at
    created_at=$(pr_created_at "$pr")
    if [[ -n "$created_at" ]]; then
      local created_epoch
      created_epoch=$(date -jf "%Y-%m-%dT%H:%M:%SZ" "$created_at" +%s 2>/dev/null || date -d "$created_at" +%s 2>/dev/null || echo "0")
      local pr_age=$(( now - created_epoch ))
      if [[ "$pr_age" -lt "$FALLBACK_STALE_THRESHOLD" ]]; then
        continue
      fi
    fi

    local reviews
    reviews=$(fetch_pr_data "$pr")

    if [[ "$reviews" -lt 1 ]]; then
      log "Fallback: PR #$pr stale with 0 reviews, spawning code review"
      spawn_code_review "$pr" || true
    elif [[ "$reviews" -lt 2 ]]; then
      log "Fallback: PR #$pr stale with 1 review, spawning PO"
      spawn_po_review "$pr" || true
    elif [[ "$reviews" -ge 2 ]]; then
      log "Fallback: PR #$pr stale with 2+ reviews, spawning merge"
      spawn_merge_agent "$pr" || true
    fi
  done
}

# ============================================================================
# Issue backlog management
# ============================================================================

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
    if [[ -z "$dep_state" ]]; then
      dep_state=$(gh api "repos/$REPO/issues/$dep" --jq '.state' 2>/dev/null || echo "unknown")
      if [[ "$dep_state" != "closed" ]]; then
        log "  Issue #$issue blocked by open dependency #$dep"
        return 1
      fi
    else
      log "  Issue #$issue blocked by open dependency #$dep"
      return 1
    fi
  done
  return 0
}

fallback_sweep_issues() {
  log "Fallback: checking issue backlog"
  fetch_all_issues

  local active_worker_count
  active_worker_count=$(echo "$CACHED_SESSIONS" | grep -c "issue-" 2>/dev/null || echo "0")
  local open_issues
  open_issues=$(echo "$ISSUES_JSON" | jq -r '.[] | select(.pull_request == null) | select(.labels[].name == "ao:ready") | .number' 2>/dev/null || echo "")

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
        local session
        session=$(ao status 2>/dev/null | grep -E "^\s+vc-" | grep "issue-$issue" | awk '{print $1}' | tail -1)
        [[ -n "$session" ]] && ao send "$session" "/model sonnet" --timeout 30 2>/dev/null || true
      ) &
    fi
    active_worker_count=$((active_worker_count + 1))
  done
}

# ============================================================================
# Cleanup
# ============================================================================

kill_stale_sessions() {
  echo "$CACHED_SESSIONS" | while read -r line; do
    [[ -z "$line" ]] && continue
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

cleanup_processed_events() {
  [[ ! -d "$PROCESSED_DIR" ]] && return
  # Remove processed triggers older than 24h
  find "$PROCESSED_DIR" -name "*.trigger" -mmin +1440 -delete 2>/dev/null || true
  # Cap failed directory at 100 files
  local failed_count
  failed_count=$(find "$FAILED_DIR" -name "*.trigger" 2>/dev/null | wc -l || echo "0")
  if [[ "$failed_count" -gt 100 ]]; then
    find "$FAILED_DIR" -name "*.trigger" 2>/dev/null | sort | head -n $(( failed_count - 100 )) | xargs rm -f 2>/dev/null || true
  fi
}

# ============================================================================
# Main loop
# ============================================================================

mkdir -p "$EVENTS_DIR" "$PROCESSED_DIR" "$FAILED_DIR"

log "Pipeline driver started (events every ${EVENT_POLL}s, kill-check every ${KILL_CHECK_INTERVAL}s, fallback every ${FALLBACK_INTERVAL}s). Ctrl+C to stop."

while true; do
  CYCLE=$((CYCLE + 1))

  if ! ao status &>/dev/null 2>&1; then
    log "AO not running, skipping"
    sleep "$EVENT_POLL"
    continue
  fi

  # Primary: process event triggers (every cycle)
  process_events

  now=$(date +%s)

  # Kill stale sessions every 60s (independent of fallback sweep)
  if [[ $(( now - LAST_KILL_CHECK )) -ge "$KILL_CHECK_INTERVAL" ]]; then
    LAST_KILL_CHECK=$now
    refresh_sessions
    kill_stale_sessions
  fi

  # Fallback + maintenance (every FALLBACK_INTERVAL)
  if [[ $(( now - LAST_FALLBACK )) -ge "$FALLBACK_INTERVAL" ]]; then
    LAST_FALLBACK=$now
    FALLBACK_CYCLE=$((FALLBACK_CYCLE + 1))

    refresh_sessions

    # Cleanup
    git worktree prune 2>/dev/null || true
    ao session cleanup 2>/dev/null || true
    kill_stale_sessions
    cleanup_processed_events

    # Refresh after cleanup
    refresh_sessions

    # Fallback PR sweep
    fallback_sweep_prs

    # Issue backlog (every Nth fallback cycle)
    if [[ $((FALLBACK_CYCLE % ISSUE_EVERY)) -eq 0 ]]; then
      fallback_sweep_issues
    fi

    # Post-merge CI check
    check_postmerge_ci
  fi

  sleep "$EVENT_POLL"
done
