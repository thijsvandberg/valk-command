Implement a user story end-to-end. Pick up the story, work through all checkboxes, test everything, and deliver working code.

## Input

$ARGUMENTS should be a story ID like `BRDG-XXX`. Find the matching file in `docs/user-stories/BRDG-XXX-*.md`.

## Workflow

### 1. Read the story

- Find and read `docs/user-stories/BRDG-XXX-*.md`
- Understand all acceptance criteria and checkboxes
- If the story references other files (PRD, architecture docs), read those too
- **If all checkboxes are already `[x]`**: report that the story is already complete and stop.

### 2. Plan (no mode switch)

Before writing any code, launch an **Agent** subagent with `subagent_type: "Plan"` to create the implementation plan. The agent's prompt must include:

- The full content of the story file
- The content of any referenced architecture/PRD docs
- Instruction to return a concise, numbered implementation plan covering:
  - Which files, components, and APIs will be touched per checkbox
  - Implementation order and dependencies between checkboxes
  - Any gaps, ambiguities, or missing acceptance criteria

The Plan subagent cannot write files. After it returns the plan, **you** (the main agent) must write it into the story `.md` file under a new `## Implementation Plan` heading (inserted before the first checklist/acceptance criteria section). Then immediately proceed to implementation. Do NOT enter plan mode. Do NOT pause, ask for confirmation, or offer choices.

### 3. Implement checkbox by checkbox

For each checkbox in the story:

1. Implement the change
2. **Write tests** for the change if relevant:
   - New UI components: render states, user interactions, keyboard support
   - New/modified API endpoints: happy path, error cases, edge cases
   - New utility functions: unit tests for all input variants
   - Update existing tests that break due to your changes
3. Mark the checkbox as done `[x]` in the `.md` file
4. Run `npm run lint` and `npm run typecheck` in parallel (both are read-only and can run concurrently)
5. If tests were added or modified, run only the changed test files: `npx vitest run <specific-test-file-paths>`. Do NOT run the full test suite per checkbox.
6. Do NOT run `npm run build` during per-checkbox work. Build is only run in final verification.
7. Fix any failures before moving to the next checkbox
8. **Commit per logical unit** using conventional commits (`feat:`, `fix:`, `chore:`)

If a checkbox is unclear or ambiguous: **skip it**, annotate it inline in the `.md` file with `<!-- skipped: <reason> -->`, continue with the rest.

### 4. If the story involves UI work

Invoke the `frontend-design` skill before writing any frontend code. Follow all anti-generic guardrails from the global rules.

### 5. Final verification

After all checkboxes are done:

1. Run `npm run verify` (runs lint + typecheck in parallel, then the full test suite)
2. `npm run build`
3. Visual/e2e verification (if applicable):
   - **Skip entirely for non-UI stories** (API-only, backend, database, library changes). Only perform browser verification when the story modifies components, pages, or styles.
   - **Navigation:** Navigate through the app starting from the sprint board (click on a ticket) rather than directly visiting a URL. Direct URL navigation triggers Clerk auth redirects.
   - **Dev server:** Keep the dev server running throughout. Do NOT restart it between checks unless it has actually crashed.
   - **Screenshot retries:** Maximum 3 attempts per visual check. After 3 failures, log the issue and continue. Do not enter an infinite retry loop.
4. Fix anything that is broken. Repeat until everything passes.

### 6. Handle problems found along the way

- **Small issues** (typos, minor bugs, small refactors): fix them directly
- **Larger issues** that need discussion: create a new user story in `docs/user-stories/` using the standard `BRDG-XXX-name.md` format
- **Observations, tech debt, findings**: write to `docs/investigations/YYYY-MM-DD-<topic>.md`

### 7. Archive the story

When all checkboxes are `[x]`:

1. Move the story file to `docs/user-stories/completed/`
2. Commit the move: `chore: archive BRDG-XXX as completed`

### 8. Performance review

After archiving, reflect on the run and check for notable issues:
- Phases that took unexpectedly long (build failures, retry loops, auth issues, slow tests)
- Browser automation problems (navigation retries, screenshot failures, session expiry)
- Unexpected blockers (unrelated code breaking the build, flaky tests, merge conflicts)

**Only if there is something worth logging**, append an entry to `docs/performance-log.md` with the story ID, date, total time, a phase breakdown table, and a short list of key bottlenecks. If the run was smooth, skip this step entirely.

### 9. Report

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
