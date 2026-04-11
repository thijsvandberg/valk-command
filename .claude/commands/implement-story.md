Implement a user story end-to-end. Pick up the story, work through all checkboxes, test everything, and deliver working code.

## Input

$ARGUMENTS should be a story ID like `BRDG-XXX`. Find the matching file in `docs/user-stories/BRDG-XXX-*.md`.

## Workflow

### 1. Read the story

- Find and read `docs/user-stories/BRDG-XXX-*.md`
- Understand all acceptance criteria and checkboxes
- If the story references other files (PRD, architecture docs), read those too
- **If all checkboxes are already `[x]`**: report that the story is already complete and stop.

### 2. Enrich with plan mode

Before writing any code, enter plan mode to:

- Identify gaps, ambiguities, or missing acceptance criteria
- Map out which files, components, and APIs will be touched
- Break down complex checkboxes into smaller implementation steps if needed
- Add technical notes directly into the story `.md` file where useful

Exit plan mode before starting implementation.

### 3. Implement checkbox by checkbox

For each checkbox in the story:

1. Implement the change
2. Mark the checkbox as done `[x]` in the `.md` file
3. Run `npm run lint`, `npm run typecheck`
4. Fix any failures before moving to the next checkbox
5. **Commit per logical unit** using conventional commits (`feat:`, `fix:`, `chore:`)

If a checkbox is unclear or ambiguous: **skip it**, annotate it inline in the `.md` file with `<!-- skipped: <reason> -->`, continue with the rest.

### 4. If the story involves UI work

Invoke the `frontend-design` skill before writing any frontend code. Follow all anti-generic guardrails from the global rules.

### 5. Final verification

After all checkboxes are done:

1. `npm run lint`
2. `npm run typecheck`
3. `npm run test`
4. `npm run build`
5. Visual/e2e verification via browser automation (open the relevant pages, verify they work)
6. Fix anything that is broken. Repeat until everything passes.

### 6. Handle problems found along the way

- **Small issues** (typos, minor bugs, small refactors): fix them directly
- **Larger issues** that need discussion: create a new user story in `docs/user-stories/` using the standard `BRDG-XXX-name.md` format
- **Observations, tech debt, findings**: write to `docs/investigations/YYYY-MM-DD-<topic>.md`

### 7. Archive the story

When all checkboxes are `[x]`:

1. Move the story file to `docs/user-stories/completed/`
2. Commit the move: `chore: archive BRDG-XXX as completed`

### 8. Report

When done, report:
- What was completed
- What was skipped and why (also annotated inline in the story file)
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
