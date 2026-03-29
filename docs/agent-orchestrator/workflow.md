# AO Workflow for valk-command

## Preparing Work (Interactive Claude Session)

From a Claude session in valk-command:

1. Discuss and define the feature
2. Write a user story in `docs/user-stories/VC-XXX-name.md`
3. Create a GitHub Issue with clear description and acceptance criteria
4. Add it to `docs/todo.md`

## Dispatching Work to AO

```bash
# Start AO (if not running)
npm run ao

# Spawn a worker for a single issue
ao spawn <issue-number>

# Spawn multiple workers
ao batch-spawn 1 2 3

# Check status
npm run ao:status

# Open dashboard
ao dashboard
```

### npm Convenience Scripts

| Script | Command | What it does |
|--------|---------|--------------|
| `npm run ao` | `ao start valk-command` | Start the AO orchestrator for this project |
| `npm run ao:stop` | `ao stop valk-command` | Stop the orchestrator and all its sessions |
| `npm run ao:status` | `ao status` | Show status of all active sessions |
| `npm run ao:nudge` | `tools/scripts/pipeline-driver.sh` | Start the event-driven pipeline driver |

## PR Pipeline

Every PR goes through a four-stage pipeline before merge. The pipeline is event-driven: PostToolUse hooks detect agent commands (`gh pr create`, `gh pr review`, `gh pr merge`) and write trigger files. The pipeline driver (`tools/scripts/pipeline-driver.sh`) processes these triggers and spawns the next agent. See [event-driven-pipeline.md](../architecture/event-driven-pipeline.md) for full architecture details.

Pipeline stage is determined by review count on the PR:
- **0 reviews** = needs code review
- **1 review** = needs PO acceptance
- **2+ reviews** = ready for merge

```
Worker creates PR (targeting dev)
  |-- hook writes pr_created trigger
  v
Code Review Agent (ao spawn --claim-pr <number>)
  |-- hook writes review_approved trigger
  v
PO Acceptance Agent (ao spawn --claim-pr <number>)
  |-- hook writes review_approved trigger
  v
Merge Agent (ao spawn --claim-pr <number>) -- rebase + merge to dev
  |-- hook writes pr_merged trigger
  v
Done + post-merge CI verification
```

### 1. Code Review

When a PR is created, the metadata-updater hook writes a `pr_created` trigger. The pipeline driver picks it up and spawns a review agent with `ao spawn --claim-pr <pr-number>`. The review agent:

- Reads `CLAUDE.md` for project standards
- Reads the full diff with `gh pr diff`
- Checks: tests included, conventional commits, no secrets, correct TypeScript types, English code, no scope creep, build passes
- Approves (`gh pr review --approve`) or requests changes with specific feedback

### 2. PO Acceptance

When the code review agent approves, the hook writes a `review_approved` trigger. The pipeline driver checks the review count (1 = code review done) and spawns a PO acceptance agent. The PO agent:

- Reads the linked issue to understand acceptance criteria
- Reads the PR diff, comments, and review threads
- Verifies all acceptance criteria are met, no scope creep, PR description is accurate, and the work is production-ready
- Approves with a summary or requests changes listing gaps against the issue AC
- Does NOT merge; that is the merge agent's job

### 3. Merge

When the PO agent approves (2+ reviews on the PR), the hook writes another `review_approved` trigger. The pipeline driver spawns a merge agent. The merge agent:

- Fetches latest `dev` and rebases the PR branch on it
- Resolves conflicts if possible (runs build + tests to verify)
- Force-pushes the rebased branch with `--force-with-lease`
- Merges with `gh pr merge --squash --delete-branch`
- If conflicts cannot be resolved cleanly, posts a comment for manual intervention

### 4. Done

After the merge agent lands the PR, the issue is automatically closed via "Closes #N" in the PR description. CI runs post-merge on dev; the pipeline driver monitors for failures.

## Branching Strategy

- **`dev`** is the integration branch. All agent PRs target `dev`.
- **`main`** is the production branch. Promoted from `dev` via `npm run promote` (creates a PR from dev to main).
- Workers are configured with `defaultBranch: dev` in `~/.agent-orchestrator.yaml` and use `gh pr create --base dev`.

### GitHub Repo Settings

The following repository settings are enabled via GitHub API:

- `allow_auto_merge`: enabled
- `allow_update_branch`: enabled
- `delete_branch_on_merge`: enabled

### Branch Protection (dev)

- No required status checks. CI runs post-merge (on push to dev).
- Agents must run the full local build (lint, typecheck, test, build) before pushing.
- Force pushes and branch deletion are blocked.

### Branch Protection (main)

- Required status check: `build` must pass before merge.
- CI runs on PR to main (pre-merge gate).

## Dependency Management

Issues can declare dependencies on other issues using markers in the issue body:

- `Depends on #N` or `Depends on: #N`

Before spawning a worker for an issue, the orchestrator checks each dependency:

1. Parses the issue body for dependency markers
2. Queries the dependency issue state via `gh issue view <N> --json state`
3. If any dependency is still open, the issue is skipped
4. Skipped issues are re-checked on every loop iteration

This ensures issues are worked on in the correct order without manual sequencing.

## Agent Limits

- Maximum **2 concurrent coding workers** at any time
- Review agents and PO acceptance agents spawned via `ao spawn --claim-pr` do **not** count toward this limit
- This means the orchestrator can run 2 workers + any number of review/PO agents simultaneously

## Pipeline Driver

The pipeline driver (`tools/scripts/pipeline-driver.sh`) combines event processing with a fallback sweep.

### Two cadences

1. **Every 5 seconds**: processes trigger files from `.ao-events/` written by PostToolUse hooks
2. **Every 5 minutes** (configurable): fallback sweep for stale PRs, issue backlog management, session cleanup

### How to run it

```bash
# Start with default intervals (runs in foreground, Ctrl+C to stop)
npm run ao:nudge

# Custom fallback interval (600 seconds)
tools/scripts/pipeline-driver.sh 600
```

Run this alongside AO in a separate terminal. It is safe to stop and restart at any time. Trigger files persist on disk so no events are lost during restarts.

## Monitoring

```bash
# Status overview
ao status

# Attach to a worker's terminal
ao session attach <session>

# Send a message to a worker
ao send <session> "your instruction"

# Web dashboard
# http://localhost:3000
```

## After PR is Created

The lifecycle manager and pipeline driver handle progression:
- CI failure (post-merge) -> pipeline driver detects via `gh run list` -> desktop notification
- Review comments -> forwarded to agent -> agent addresses and pushes
- Pipeline progresses through code review -> PO acceptance -> merge agent (driven by event triggers)

## Cleanup

```bash
# Auto-cleanup merged/closed sessions
ao session cleanup

# Kill a specific session
ao session kill <session>

# Stop everything
npm run ao:stop
```

## Spawning with Different Models

Currently no `--model` flag exists on `ao spawn`. All workers use the model from the project config.

Options for varying the model per task:
1. **Dual project entries** in `~/.agent-orchestrator.yaml` with different `sessionPrefix` and `agentConfig.model`. Target via `AO_PROJECT_ID` env var.
2. **Issue labels** (coming, PR #259): label an issue with `model:haiku` or `model:opus` and the worker uses that model.

See [config-reference.md](config-reference.md#model-selection) for full details.

## Current AO Config for valk-command

Location: `~/.agent-orchestrator.yaml`

Key settings:
- **Runtime:** tmux
- **Agent:** claude-code
- **Workspace:** worktree (git worktrees for isolation)
- **Symlinks:** node_modules
- **postCreate:** npm install
- **Max concurrent workers:** 2 (set in orchestratorRules)
- **Review/PO agents:** unlimited (do not count toward worker limit)
- **Dependency checking:** automatic, based on "Depends on #N" in issue body
- **MCP denylist:** Slack, Gmail, Calendar, Atlassian, Canva, Notion, Figma, DocuSeal, Ahrefs, Neon (in `.claude/settings.json`)

## Known Limitations

- **Orchestrator goes idle.** The orchestrator does not proactively follow its pipeline rules between check cycles. The pipeline driver (`npm run ao:nudge`) handles pipeline progression via event triggers and fallback sweeps.
- **Self-approval not possible.** All agents run under the same GitHub account. GitHub blocks self-approval, so `gh pr review --approve` falls back to a COMMENTED review instead. Reviews are informational only; they do not produce the "APPROVED" status that branch protection could require.
- **`ao spawn --claim-pr` fails on existing worktrees.** If a branch is already checked out in another worktree (e.g., a previous agent session that was not cleaned up), spawning a new agent for the same PR will fail. Use `ao session cleanup` to remove stale sessions first.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Worker asks for confirmation instead of working autonomously | Check CLAUDE.md has "Agent Mode" section. Check `agentRules` in config. |
| Orchestrator is idle, not spawning workers | Start the pipeline driver (`npm run ao:nudge`) or manually: `ao send <orch-session> "Check ao status and act on what you see"` |
| Review comments not forwarded to worker | Only formal "changes_requested" reviews trigger auto-routing. Use `ao review-check` or `ao send` manually. |
| Copilot opens competing PRs | Disable Copilot Coding Agent in repo settings. |
| Worker can access Slack/Gmail/etc | Check `.claude/settings.json` has `deniedMcpServers` list. New workers inherit from main branch. |
| Issue not being picked up despite being open | Check for `ao:ready` label (required) and `Depends on #N` in the issue body. |
| Pipeline driver says "AO not running, skipping" | Start AO first with `npm run ao`, then run the pipeline driver in a separate terminal. |
| Events not being processed | Check `.ao-events/` for stuck trigger files. Check `.claude/settings.json` for hook config. |
| Post-merge CI failure | Check `gh run list --branch dev --limit 5`. Pipeline driver sends desktop notification on failure. |
