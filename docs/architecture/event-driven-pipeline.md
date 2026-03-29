# Event-Driven Pipeline

## Overview

The pipeline uses PostToolUse hooks to detect agent actions (PR creation, review submission, merge) and write trigger files. A pipeline driver processes these triggers and spawns the next agent in the pipeline. A fallback sweep catches missed events.

## Architecture

```
Agent executes command (gh pr create, gh pr review, etc.)
  |
  v
PostToolUse hook (.claude/metadata-updater.sh)
  |-- updates AO session metadata (existing behavior)
  |-- writes trigger file to .ao-events/ (new)
  |
  v
Pipeline driver (tools/scripts/pipeline-driver.sh)
  |-- polls .ao-events/ every 5s
  |-- determines next pipeline stage
  |-- spawns agent via ao spawn + ao send
  |-- moves trigger to .ao-events/processed/
  |
  v
Fallback sweep (same script, every 5 min)
  |-- catches stale PRs where hooks missed
  |-- spawns issue workers from backlog
  |-- kills zombie sessions, prunes worktrees
```

## Pipeline Stages

```
Worker creates PR  ----[hook: pr_created]----> Code Review Agent
                                                    |
Review approves    ----[hook: review_approved]----> PO Agent (if 1 review)
                                                    |
PO approves        ----[hook: review_approved]----> Merge Agent (if 2+ reviews)
                                                    |
Merge agent merges ----[hook: pr_merged]---------> Done + post-merge CI check
```

## Trigger File Format

Location: `.ao-events/` (gitignored)

Naming: `{unix_timestamp}-{event_type}.trigger`

```
event=review_approved
pr=https://github.com/thijsvandberg/valk-command/pull/42
session=vc-109
timestamp=1774725391
branch=feat/issue-34
```

### Event Types

| Event | Written when | Pipeline action |
|-------|-------------|-----------------|
| `pr_created` | `gh pr create` succeeds | Spawn code review agent |
| `review_approved` | `gh pr review --approve` | Check review count: 1 -> PO, 2+ -> merge |
| `review_changes_requested` | `gh pr review --request-changes` | None (lifecycle manager handles) |
| `pr_merged` | `gh pr merge` succeeds | Log + post-merge CI check |
| `pr_pushed` | `git push` succeeds | None (informational) |

## CI Strategy

- **dev**: CI runs post-merge (on push). No pre-merge gate. Agents verify locally before pushing.
- **main**: CI runs on PR (pre-merge gate). Required status check: `build`.

Post-merge CI failures on dev are detected by the pipeline driver (checks `gh run list --branch dev` every fallback cycle) and trigger a desktop notification.

## Fallback Mechanism

The pipeline driver runs a fallback sweep every 5 minutes:

1. Fetches all open PRs targeting dev
2. For any PR older than 10 minutes without an active agent session, spawns the appropriate agent based on review count
3. Spawns workers for open issues (respects dependency ordering and worker limits)
4. Cleans up stale sessions and worktrees

This ensures the pipeline progresses even if hooks fail silently or the pipeline driver restarts.

## Directory Structure

```
.ao-events/
  1774725391-pr-created.trigger      # pending trigger
  processed/                          # successfully handled triggers
    1774725300-review-approved.trigger
  failed/                             # triggers that failed after 2 min
    1774725200-pr-created.trigger
```

Processed triggers are cleaned up after 24 hours. Failed directory is capped at 100 files.

## Running

```bash
# Start the pipeline driver (replaces the old nudge script)
npm run ao:nudge

# Custom fallback interval (default 300s)
tools/scripts/pipeline-driver.sh 600
```

## Hooks

The following PostToolUse hooks support the pipeline:

| Hook | Matcher | Purpose | Timeout |
|------|---------|---------|---------|
| metadata-updater.sh | Bash | Detect commands, write triggers + metadata | 5s |
| Pre-push build check | Bash | Run `npm run build` after `git push` | 120s |
| Test runner | Edit/Write | Run tests after .ts/.tsx edits | 30s |

## Troubleshooting

| Problem | Check |
|---------|-------|
| Event not processed | `ls .ao-events/*.trigger` for stuck triggers |
| Hook not firing | `cat .claude/settings.json` for hook config |
| Double spawning | `ao status` for duplicate sessions on same PR |
| Post-merge CI failed | `gh run list --branch dev --limit 5` |
| Pipeline driver not running | Check terminal running `npm run ao:nudge` |
| Stale triggers in failed/ | `ls .ao-events/failed/` and inspect contents |
