Implement a user story end-to-end. Pick up the story, work through all checkboxes, test everything, and deliver working code.

## Input

$ARGUMENTS should be a story ID like `BRDG-XXX`. Find the matching file in `docs/user-stories/` (check both root and `completed/` subdirectory).

## Workflow

### 1. Read the story

- Find and read `docs/user-stories/BRDG-XXX-*.md` (or `completed/BRDG-XXX-*.md`)
- Understand all acceptance criteria and checkboxes
- If the story references other files (PRD, architecture docs), read those too

### 2. Implement checkbox by checkbox

For each checkbox in the story:

1. Implement the change
2. Mark the checkbox as done `[x]` in the `.md` file
3. Run `npm run lint`, `npm run typecheck`, `npm run test`
4. Fix any failures before moving to the next checkbox
5. **Commit per logical unit** using conventional commits (`feat:`, `fix:`, `chore:`)

If a checkbox is unclear or ambiguous: **skip it**, continue with the rest. Track skipped items to report at the end.

### 3. If the story involves UI work

Invoke the `frontend-design` skill before writing any frontend code. Follow all anti-generic guardrails from the global rules.

### 4. Final verification

After all checkboxes are done:

1. `npm run lint`
2. `npm run typecheck`
3. `npm run test`
4. `npm run build`
5. Visual/e2e verification via browser automation (open the relevant pages, verify they work)
6. Fix anything that is broken. Repeat until everything passes.

### 5. Handle problems found along the way

- **Small issues** (typos, minor bugs, small refactors): fix them directly
- **Larger issues** that need discussion: create a new user story in `docs/user-stories/` using the standard `BRDG-XXX-name.md` format
- **Observations, tech debt, findings**: write to `docs/investigations/YYYY-MM-DD-<topic>.md`

### 6. Report

When done, report:
- What was completed
- What was skipped and why
- Any new user stories or investigation files created
- Any issues encountered

## Rules

- Do NOT create branches without discussing first
- Do NOT push or create PRs without being asked
- Do NOT write to Jira without explicit permission
- Do NOT ask questions that block progress. Skip unclear items and report them at the end.
- DO commit per logical unit as you go
- DO keep the story `.md` file updated throughout
- DO run all checks after every meaningful change
