Give a concise status overview of the project. Run all checks in parallel and present a single summary.

## Checks to run

1. `ao status 2>/dev/null` - active AO sessions
2. `gh pr list --repo thijsvandberg/valk-command --state open --json number,title,statusCheckRollup,reviews` - open PRs with CI and review status
3. `gh issue list --repo thijsvandberg/valk-command --state open --json number,title` - open issues (backlog)
4. `git log --oneline -5` - recent commits on current branch
5. `git status --short` - local changes
6. `npm run test 2>&1 | tail -3` - test status

## Output format

Present as a compact dashboard:

**Branch:** current branch + clean/dirty
**Tests:** pass/fail count
**Sessions:** count + what they're working on (1 line each)
**PRs:** number, title, CI status, review count (1 line each)
**Issues:** number, title (1 line each)
**Recent:** last 3 commits (1 line each)

Keep it short. No explanations, just the data. Flag anything that needs attention (failing CI, stuck sessions, uncommitted changes).
