Monitor the AO pipeline: check health, unstick processes, log findings, track token/model efficiency.

Run this with `/loop 3m /ao` for continuous monitoring. Stop the loop to stop monitoring.

## Steps

### 1. Gather pipeline state

Run all of these in parallel:

1. `ao status 2>/dev/null` - parse session list (session ID, state, branch/PR, age)
2. `gh pr list --repo thijsvandberg/valk-command --state open --json number,title,headRefName,reviews,statusCheckRollup,createdAt,labels` - open PRs
3. `gh issue list --repo thijsvandberg/valk-command --state open --json number,title,labels,body` - open issues
4. `ls -la .ao-events/*.trigger 2>/dev/null` - pending triggers
5. `ls -la .ao-events/failed/*.trigger 2>/dev/null` - failed triggers
6. `gh run list --branch dev --limit 3 --json conclusion,headSha,displayTitle,createdAt 2>/dev/null` - recent CI on dev

### 2. Analyze each session

For every active session, determine its real state:

- **Truly working**: session shows "working" AND has recent git activity (check with `git -C` on the worktree, or PR has recent push). Leave it alone.
- **Long-running but active**: session has been "working" for 5+ min but there IS recent activity (commits, PR updates). Note for token tracking but do not intervene.
- **Zombie**: session shows "ready" or "idle" for 3+ min with NO recent output. This agent is stuck.
- **Wrong model**: check the issue's `model:sonnet` or `model:opus` label against what's running. Note: model switch is OS-wide (affects ALL agents), so only flag this, do not switch unless this is the ONLY running session.

For worktree activity checks, look at the session's branch and check:
```bash
# Find worktree path
git worktree list 2>/dev/null | grep "<branch>"
# Check recent commits
git -C <worktree-path> log --oneline -3 --since="10 minutes ago" 2>/dev/null
```

### 3. Analyze PRs

For each open PR:
- Does it have an active session? If not, how long has it been without one?
- What pipeline stage is it at (0 reviews = needs code review, 1 = needs PO, 2+ = needs merge)?
- Is CI green?
- Is it stuck? (no activity for 10+ min, no session assigned)

### 4. Analyze issues

For each open issue:
- Does it have the right `model:` label? If missing, check complexity (lines of change expected, number of AC) and suggest/add one.
- Are dependencies met?
- Is there already a PR or worker for it?

### 5. Take quick actions

Do these immediately and log them:

- **Kill zombies**: `ao session kill <session>` for confirmed zombie sessions (idle 3+ min, no git activity)
- **Retry failed triggers**: move files from `.ao-events/failed/` back to `.ao-events/` if they look valid and the underlying issue seems resolved
- **Add missing labels**: `gh issue edit <N> --add-label "model:sonnet"` (or opus) for issues missing model labels
- **Flag model mismatches**: if an agent is running on the wrong model but other agents are also running (cannot switch), log it prominently

Do NOT:
- Switch model (OS-wide impact on all running agents)
- Merge PRs
- Close issues
- Modify agent rules or pipeline-driver.sh (log suggestions instead)

### 6. Write feedback log

Append findings to today's file at `docs/agent-orchestrator/feedback/YYYY-MM-DD.md`.

If the file does not exist yet, create it with this header:
```markdown
# AO Feedback - YYYY-MM-DD

## Summary
<!-- Updated each /ao run with latest totals -->

## Log
```

For each run, append a section under `## Log`:

```markdown
### HH:MM - Check
**Pipeline:** X workers active, Y PRs open, Z issues open, N pending triggers
**CI:** last 3 runs status

**Sessions:**
- vc-XX: [state] on [branch/PR], [age], model [model]. [assessment: healthy / long-running / zombie / wrong model]

**Findings:**
- [What was observed, with enough context to understand the situation]

**Actions taken:**
- [What was done and why, e.g. "Killed vc-XX: idle 5 min, no git activity since 14:20"]
- [Quick fixes applied, e.g. "Added model:sonnet label to #25 (simple CSS fix, 2 AC)"]

**Token/model notes:**
- [e.g. "vc-XX running opus on #25 (12-line CSS fix) - overkill but cannot switch, vc-YY also running opus on complex #28"]
- [e.g. "Review agent on PR #40 ran 8 min for a 15-line change - consider reducing review prompt scope for small PRs"]

**Suggestions:**
- [Process improvements to investigate later, e.g. "Review agents consistently take 6+ min on trivial PRs. Consider a 'light review' prompt for PRs under 50 LOC changed."]
```

### 7. Update patterns

After logging, read `docs/agent-orchestrator/feedback/patterns.md` and check if today's findings match or extend any known pattern. If so, update the patterns file. Look for:

- Recurring failure modes (same type of zombie, same spawn failure)
- Token waste patterns (same agent type consistently overusing resources)
- Model selection issues (certain issue types consistently mislabeled)
- Process improvements that worked (note successful quick fixes)

### 8. Report to user

Output a SHORT status (2-4 lines max) to the user. Only include details if something needs attention. Examples:

**All healthy:**
```
AO: 2 workers active, 3 PRs progressing, 0 issues. All healthy.
```

**Issues found:**
```
AO: 2 workers, 1 zombie killed (vc-101, idle 5 min on #25). PR #42 stuck without agent for 12 min - pipeline-driver should pick up next cycle. Added model:sonnet to #30.
```

**Suggestions:**
```
AO: 1 worker, 2 PRs progressing. Token note: review agent on #40 ran 9 min (15 LOC change). Consider light-review prompt for small PRs. Logged to feedback.
```

$ARGUMENTS
