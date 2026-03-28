# End-of-day status 2026-03-28

## Branch: dev (clean)

## Open PRs (all CI green, all target dev)

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

## Pipeline fixes applied today

1. **Rate limit optimization**: switched nudge from GraphQL to REST API, batch fetches, ~80% fewer API calls
2. **Split loop**: PRs checked every 90s (fast pipeline), issues every 7.5 min (saves API calls)
3. **Duplicate PR prevention**: nudge now checks for existing open PRs before spawning workers
4. **Zombie cleanup**: stale sessions (ready 3+ min) auto-killed, `ao session cleanup` each cycle
5. **Route manifest test**: prevents route regressions (changelog disappearing)
6. **postToolUse hook**: runs test suite after .ts/.tsx edits
7. **Model selection via labels**: `model:sonnet` / `model:opus` on issues, determined by `/issue` command

## Known issues

- **Zombie sessions**: agents go "ready" and stop responding. Auto-kill helps but root cause unclear.
- **Duplicate PRs**: still happened today (#31, #32, #33 for issue #30). Dedup check added but not yet battle-tested.
- **Rate limits**: improved but agents themselves also consume API calls. Monitor tomorrow.

## Idea: event-driven pipeline via AO hooks

Instead of polling every 90s, use AO's `postToolUse` or session hooks in `.claude/settings.json` to trigger the next pipeline stage immediately when an agent finishes. For example:

- Worker creates PR -> hook detects `gh pr create` -> spawns code review agent
- Review agent submits review -> hook detects `gh pr review` -> spawns PO agent
- PO agent approves -> hook detects approval -> spawns merge agent

This would eliminate polling entirely, reduce API calls to near-zero for the nudge, and cut pipeline latency from minutes to seconds. The nudge script would only be needed as a fallback/cleanup process.

Investigate: does AO support session-level hooks or events? If not, a filesystem watcher on the worktree or a GitHub webhook receiver could achieve the same.

## Tomorrow: pick up

1. Merge PR #25 (has 3 reviews, ready)
2. Review + merge PRs #32, #37, #38 (or let pipeline handle it)
3. Start nudge: `npm run ao:nudge`
4. Monitor for zombie/duplicate issues with the new fixes
5. Issues #16 (app shell) and #17 (view placeholders) are still in backlog
6. Investigate event-driven pipeline via hooks (see idea above)
