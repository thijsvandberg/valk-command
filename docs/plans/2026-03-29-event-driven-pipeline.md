# Event-Driven Pipeline + Post-Merge CI

## Context

The current pipeline uses a polling nudge script (90s cycle) that makes 3-4 GitHub API calls per PR per cycle to determine pipeline stage. This works but adds latency (0-90s per transition) and burns API quota even when nothing changed. Since agents already run the full build locally before pushing, the remote CI on PRs is redundant.

**Goal**: Replace polling with event-driven hooks, move CI to post-merge only, reduce API calls to near-zero for normal pipeline flow.

## Plan

### Phase 1: Event trigger infrastructure

**1a. `.gitignore`** - add `.ao-events/`

**1b. Extend `.claude/metadata-updater.sh`** - add trigger file writing

The hook already detects `gh pr create` and `gh pr merge`. Add detection for:
- `git push` -> write `.ao-events/{timestamp}-pr-pushed.trigger`
- `gh pr review --approve` -> write `.ao-events/{timestamp}-review-approved.trigger`
- `gh pr review --request-changes` -> write (informational, no pipeline action)
- Existing `gh pr create` block -> also write `.ao-events/{timestamp}-pr-created.trigger`
- Existing `gh pr merge` block -> also write `.ao-events/{timestamp}-pr-merged.trigger`

Trigger file format (key=value, matches AO metadata convention):
```
event=review_approved
pr=https://github.com/thijsvandberg/valk-command/pull/42
session=vc-109
timestamp=1774725391
```

Hook only writes files (< 100ms), never calls `ao spawn`. Stays well within 5s timeout.

**1c. New: `tools/scripts/pipeline-events.sh`** - event processor

Simple bash loop, polls `.ao-events/` every 5s:
```
for each .trigger file (sorted by timestamp):
  read event type
  check for active session on same PR (dedup)
  execute action
  move to .ao-events/processed/
```

Event actions:

| Event | Action |
|-------|--------|
| `pr_created` | Spawn code review agent (`ao spawn --claim-pr`) |
| `review_approved` | Check review count via API. 1 review -> spawn PO. 2+ -> spawn merge |
| `review_changes_requested` | Log only (lifecycle manager handles) |
| `pr_merged` | Log + trigger post-merge CI check |
| `pr_pushed` | No action (agent updating existing PR) |

Agent prompts reused from current nudge script (code review, PO, merge prompts).

Retry: if `ao spawn` fails, leave trigger in place, retry next cycle. After 2 min, move to `.ao-events/failed/`.

Add npm script: `"ao:events": "tools/scripts/pipeline-events.sh"`

### Phase 2: Merge event processor + nudge into one script

**2a. New: `tools/scripts/pipeline-driver.sh`** - replaces both scripts

Single loop with two cadences:
- **Every 5s**: check `.ao-events/` for trigger files, process them
- **Every 5 min**: fallback sweep (stale PRs without active sessions for 10+ min, issue backlog, session cleanup, worktree prune)

Keeps all existing nudge functionality (issue spawning, zombie killing, stale session cleanup) but as fallback only. The event processor handles the happy path.

**2b. Update `package.json`** - `"ao:nudge"` points to new `pipeline-driver.sh`

**2c. Move `nudge-orchestrator.sh` to `deleted/`** (per project rules, no deletes)

### Phase 3: CI to post-merge

**3a. `.github/workflows/ci.yml`** - change trigger:
```yaml
on:
  push:
    branches: [dev, main]
```

**3b. Remove branch protection required status check on dev** via `gh api`:
```bash
gh api repos/thijsvandberg/valk-command/branches/dev/protection \
  --method PUT ...
```
Keep force-push and deletion blocks.

**3c. Post-merge CI monitoring** in `pipeline-driver.sh`:
- Every 60s, check latest CI run on dev: `gh run list --branch dev --limit 1`
- If failed: desktop notification with commit hash + failure details
- Future enhancement: auto-spawn fix agent

**3d. CI gate stays on main** - the promote PR (dev->main) still runs CI before merge. Safe production gate.

### Phase 4: Local build enforcement

**4a. `.claude/settings.json`** - add pre-push build check hook:
```json
{
  "matcher": "Bash",
  "hooks": [
    { ... existing metadata-updater ... },
    {
      "type": "command",
      "command": "if echo \"$TOOL_INPUT\" | grep -qE 'git[[:space:]]+push'; then npm run build 2>&1 | tail -10; fi",
      "timeout": 120000
    }
  ]
}
```

This is PostToolUse (fires after push), so it's informational: agent sees build failure and can fix. Combined with the existing test hook on Edit/Write and agentRules in CLAUDE.md, this provides solid local verification.

### Phase 5: Documentation

- `CLAUDE.md` - update branch protection section, note CI is post-merge
- `docs/agent-orchestrator/workflow.md` - rewrite PR Pipeline and Nudge sections
- `docs/architecture/event-driven-pipeline.md` - new doc describing the architecture

## Files to modify

| File | Change |
|------|--------|
| `.gitignore` | Add `.ao-events/` |
| `.claude/metadata-updater.sh` | Add `git push`, `gh pr review` detection + trigger file writing |
| `.claude/settings.json` | Add pre-push build check hook |
| `tools/scripts/pipeline-driver.sh` | **New**: combined event processor + fallback nudge |
| `tools/scripts/nudge-orchestrator.sh` | Move to `deleted/` |
| `.github/workflows/ci.yml` | Change trigger to `on: push` |
| `package.json` | Update `ao:nudge` script path |
| `CLAUDE.md` | Update branch protection + pipeline docs |
| `docs/agent-orchestrator/workflow.md` | Rewrite pipeline sections |
| `docs/architecture/event-driven-pipeline.md` | **New**: architecture doc |

## Implementation order

1. Phase 1 (event infra) + Phase 2 (merge scripts) - can run alongside existing nudge safely
2. Phase 4 (local build enforcement) - safety net before removing CI gate
3. Phase 3 (CI to post-merge) - riskiest change, do last
4. Phase 5 (docs) - after everything works

## Verification

1. Manually create a trigger file in `.ao-events/`, verify event processor picks it up
2. Have an agent create a PR, verify hook writes trigger file and event processor spawns review
3. Verify review->PO->merge transitions fire via hooks without nudge intervention
4. Push a deliberately broken commit to dev, verify post-merge CI failure is detected
5. Stop event processor, verify nudge fallback kicks in after 10 min
6. Run `npm run promote`, verify CI gate still works on main
