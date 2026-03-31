# Session: AO Pipeline Setup and Testing Infrastructure

**Date:** 2026-03-28
**Context:** Continued from project setup session. Focus on CI/CD, testing, AO pipeline, and agent review flow.

## What Was Done

### 1. Expanded CLAUDE.md with product context
Added product summary, views overview, and integrations table so AO workers understand what the app is without reading the full PRD.

### 2. Created GitHub issues for test/CI infrastructure
- #4: Vitest + React Testing Library setup
- #5: Expand CI pipeline (lint, typecheck, test, build)
- #6: Branch protection on main
- #7: Testing rules in CLAUDE.md

### 3. Configured AO orchestratorRules
- Dependency-aware backlog management ("Depends on #N" in issue bodies)
- Review agent with explicit checklist (PASS/FAIL per item + critical assessment)
- PO acceptance agent (checks issue AC against PR diff)
- Merge agent (rebase on dev, resolve conflicts, squash merge)
- Agent limits: max 2 coding workers, review/PO/merge agents unlimited

### 4. Set up dev branch workflow
- Agents merge to `dev`, not `main`
- `main` is production, promoted via `npm run promote`
- Branch protection: CI required, strict mode OFF
- GitHub settings: auto-merge, auto-update branch, delete branch on merge

### 5. Built smart nudge script
`tools/scripts/nudge-orchestrator.sh` drives the pipeline because the orchestrator goes idle:
- Checks review count on each PR to determine stage (0=review, 1=PO, 2+=merge)
- Dedup: skips PRs/issues that already have active sessions
- Nudges orchestrator for backlog (new issues without workers)
- Runs via `npm run ao:nudge`

### 6. npm convenience scripts
- `ao` - start AO + nudge
- `ao:stop` - stop AO
- `ao:status` - check status
- `ao:nudge` - run pipeline nudge loop
- `promote` - create PR from dev to main

### 7. Committed docs and nudge script
All changes pushed to dev. Issues #4, #6, #7 completed and merged to dev.

## What's Merged to Dev
- Vitest + RTL setup (PR #9)
- Testing rules in CLAUDE.md (PR #8)
- Branch protection docs (PR #10)
- Smart nudge script
- Updated CLAUDE.md and docs

## What's Still Open
- PR #11: CI pipeline expansion (issue #5) - open, needs merge
- Issue #14: Automated changelog on web interface - just created
- Nudge script on main differs from dev (main has old version)

## Known Issues / Limitations
1. **Orchestrator goes idle**: doesn't proactively follow rules. Nudge script compensates.
2. **Self-approval**: agents run under same GitHub account, so `gh pr review --approve` falls back to COMMENTED. Reviews are informational, not formal approvals.
3. **ao spawn --claim-pr** fails if the branch is already checked out in another worktree.
4. **Duplicate spawns**: happened before dedup was added. Fixed in smart nudge.
5. **Dashboard titles**: AO dashboard shows terminal buffer text as session titles, not issue/PR names.

## AO Config Location
`~/.agent-orchestrator.yaml` - contains orchestratorRules, agentRules, defaultBranch: dev

## Running State
- AO started from external iTerm terminal
- Nudge runs separately via `npm run ao:nudge`
- Dev server on port 3100 (dev branch checked out)
- AO dashboard on port 3000
