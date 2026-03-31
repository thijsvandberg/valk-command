# End-of-day status 2026-03-28 (updated 2026-03-29)

## Branch: dev

## Open PRs (all target dev)

| PR | Reviews | Title | Ready to merge? |
|----|---------|-------|-----------------|
| #25 | 3 | feat: wire Chat UI to API | Yes (reviewed) |
| #32 | 0 | feat: add changelog link to sidebar navigation | Needs review |
| #37 | 0 | fix: correct branch protection docs in CLAUDE.md | Needs review (docs only) |
| #38 | 0 | fix: trigger changelog workflow on dev merges | Needs review (CI config) |

## Open issues

| Issue | Title | Status |
|-------|-------|--------|
| #22 | feat: wire Chat UI to API | PR #25 ready to merge |
| #30 | Add changelog link to sidebar navigation | PR #32 open, needs review |
| #34 | fix: changelog workflow should also trigger on dev merges | PR #38 open, needs review |
| #36 | fix: correct branch protection docs in CLAUDE.md | PR #37 open, needs review |

## Pipeline fixes applied (2026-03-28)

1. **Rate limit optimization**: switched nudge from GraphQL to REST API, batch fetches, ~80% fewer API calls
2. **Split loop**: PRs checked every 90s (fast pipeline), issues every 7.5 min (saves API calls)
3. **Duplicate PR prevention**: nudge now checks for existing open PRs before spawning workers
4. **Zombie cleanup**: stale sessions (ready 3+ min) auto-killed, `ao session cleanup` each cycle
5. **Route manifest test**: prevents route regressions (changelog disappearing)
6. **postToolUse hook**: runs test suite after .ts/.tsx edits
7. **Model selection via labels**: `model:sonnet` / `model:opus` on issues, determined by `/issue` command

## Pipeline changes applied (2026-03-29)

1. **Event-driven pipeline**: replaced 90s polling nudge with hook-based triggers. metadata-updater.sh now writes `.ao-events/` trigger files on `gh pr create`, `gh pr review`, `git push`, `gh pr merge`. New `pipeline-driver.sh` processes triggers every 5s and spawns the next agent.
2. **CI moved to post-merge on dev**: CI workflow triggers on `push` to dev instead of `pull_request`. Removed `build` required status check from dev branch protection. Agents verify locally before pushing. Main keeps pre-merge CI gate.
3. **Pre-push build check hook**: PostToolUse hook runs `npm run build` after `git push` commands (informational, agent sees failure and can fix).
4. **Issue gating via `ao:ready` label**: only issues with the `ao:ready` label are auto-picked up by the pipeline. Manual `ao spawn` still works without label.
5. **`/ao` monitoring skill**: single-pass or looped (`/loop 3m /ao`) pipeline health checks with feedback logging to `docs/agent-orchestrator/feedback/`.
6. **Fallback sweep**: pipeline driver runs a 5-min fallback for stale PRs (10+ min without agent), issue backlog, zombie cleanup, and post-merge CI failure detection (desktop notification).

## Known issues

- **Zombie sessions**: agents go "ready" and stop responding. Auto-kill helps but root cause unclear.
- **Duplicate PRs**: dedup check added (2026-03-28), not yet battle-tested with new event-driven pipeline.
- **Event-driven pipeline**: not yet tested in production. Trigger file mechanism and fallback sweep need validation.

## Next: pick up

1. Merge PR #25 (has 3 reviews, ready)
2. Review + merge PRs #32, #37, #38 (or start pipeline: `npm run ao:nudge`)
3. Add `ao:ready` label to issues that should be auto-picked up
4. Monitor event-driven pipeline for missed triggers, double spawning
5. Validate post-merge CI detection works (push broken code to dev, check notification)
