# Handoff — BRDG-441 (inbox segmented All/New + aligned checkboxes)

Paste the block below into a fresh agent thread to run it autonomously.

```text
You are implementing story BRDG-441 (inbox header: segmented All/New + select-all, and an aligned checkbox column) end-to-end, AUTONOMOUSLY, on the `dev` branch of the Bridge (valk-command) project. This prompt is your standing approval to implement it without pausing to ask "shall I start?". Commit your own work as you go, track progress, verify it really works, and archive the story when it is genuinely green. Keep going until it is done or you hit a real blocker.

Read first: `CLAUDE.md` (project + global rules); the story `docs/user-stories/BRDG-441-inbox-segmented-all-new-and-aligned-checkboxes.md` IN FULL; the chosen prototype `src/app/dev/exploration/inbox-counts/page.tsx` (variant A + the "Aligned" checkbox column); the two stories it builds on, `docs/user-stories/completed/BRDG-438-inbox-new-unread-count-filter-digest-deeplink.md` and `docs/user-stories/completed/BRDG-434-inbox-new-since-last-visit.md`; and `docs/architecture/optimistic-updates.md` (the inbox uses the pending-edits/select wiring).

Scope & order (one story, two parts — do Part 1 first, it is self-contained, then Part 2):
1. Part 1 — Header control (variant A). In `src/app/(app)/inbox/page.tsx`, replace the current total badge + "N new" chip with a segmented All/New control (`All {total}` + `New {newCount}`, brand dot on New, active segment filled; New segment hidden when newCount is 0) plus a "Select all" button beside it (label "Select all new" when New is active; selects exactly the shown set; toggles off when all shown are selected). Wire it to the EXISTING state already in the file from BRDG-438: `newOnly`/`setNewOnly`, `newCount`, `displayRows`, `allChecked`, `toggleAll`. This is a presentation swap — do NOT change the filter/baseline logic. Match the variant-A styling from the prototype.
2. Part 2 — Aligned checkbox column. Align the `GroupStatBar` group "select all" checkbox glyph to the row checkbox glyph x (row = `BoardRow` `pl-4` + `w-3.5` gutter; group select-all = `h-5 w-5` button at `GroupCard` `px-3`). Follow the prototype's "Aligned" approach (select-all in a `w-3.5` gutter at the row inset, chevron in the `w-2` new-dot lane).

COUPLING / CAUTION (important): Part 2 edits SHARED components — `GroupStatBar.tsx`, possibly `GroupCard.tsx`, and `BoardRow.tsx`. The `GroupStatBar` group select-all is rendered on exactly TWO surfaces: the inbox AND epic-children-by-sprint (`src/components/ticket-detail/EpicChildrenBySprint.tsx`); the main sprint board renders NO group select-all checkbox. The story's "Open Questions" picks the recommended default: fix it where the select-all renders (shared tweak) and VISUALLY VERIFY the sprint board group headers + epic-children group headers do not regress. If the shared change visibly shifts the board's chevron/label inset, fall back to an opt-in prop (e.g. `alignSelectAllToRows`) passed only by the inbox + epic host. Do NOT touch the parallel-session work sitting uncommitted in the tree.

The loop:
1. Read the story. Its "Open Questions" has a recommended default — follow it; only stop if the default proves wrong once you are in the code.
2. Invoke the `frontend-design` skill BEFORE writing the frontend code (global rule — both parts are visual).
3. Implement Part 1, then Part 2. You may use `/implement-story BRDG-441` as the harness. Preserve behaviour; the tests are your guardrail.
4. Write/extend co-located tests in `src/app/(app)/inbox/page.test.tsx`: the segmented All/New control (counts, New hidden at 0, click toggles `newOnly`) and the Select-all (selects exactly the shown keys, label flips to "Select all new" under newOnly, second click clears). NOTE: the inbox header renders through a portal — these tests already seed `<div id="view-header-portal">` in a `beforeEach`; reuse that pattern. The checkbox alignment is visual (build + browser), not unit-tested.
5. Verify it ACTUALLY works (see Definition of done).
6. Commit (conventional commit referencing BRDG-441; English; no emojis; NO "Co-Authored-By"). Stage EXPLICIT paths only — never `git add -A`/`.` (the tree carries unrelated parallel-session work). Several commits is fine.
7. Tick the story's checkboxes as you satisfy them; when all are met, add a short "## Status" run note at the top and archive it: `git mv docs/user-stories/BRDG-441-inbox-segmented-all-new-and-aligned-checkboxes.md docs/user-stories/completed/` then commit `chore: archive BRDG-441 as completed`.

Definition of done (must ALL hold):
- `npm run lint`, `npm run typecheck`, `npx vitest run` (FULL suite), and `npm run build` all green.
- The story's acceptance criteria are met.
- E2E-verified in the REAL running app, not just unit tests: drive the inbox in Chrome, confirm the segmented All/New filters and the Select-all selects the shown set, and that the checkbox column is aligned. Also eyeball the sprint board group headers and the epic-children-by-sprint view to confirm no regression. Console shows no new errors. Navigate from the sprint board (click into a ticket / open the view), not by direct URL (direct URLs hit the Clerk redirect). Use the `verify` / `validate-ui` skill.
- NOTE the dev data: the dev-bypass user has ~9000 unread and `baselineAt` null (everything "new") and the inbox list is NOT virtualized, so a narrow inbox filter (a few creators via `/api/settings/inbox-filters`) keeps the rendered list small for screenshots; reset the filter afterwards.

Hard rules (non-negotiable):
- TESTS: `npx vitest run` in the FOREGROUND, ONE process at a time, no pipes, no background, no sleep+cat polling. 16GB machine — concurrent vitest thrashes swap. A postToolUse hook may auto-run tests after edits; let it finish, don't overlap it.
- Run lint + typecheck + test + build before EVERY commit. Because the tree carries unrelated parallel-session work, the trustworthy way to get a clean full-suite + build signal is a throwaway `git worktree add -d /tmp/brdg441 HEAD` with `node_modules` + `.env*` symlinked from the main repo; run verify/build there.
- DEV SERVER on port 3100 for Chrome checks: `curl -s -o /dev/null -w "%{http_code}" localhost:3100` to see if it is up before starting; never start a second instance; never background it with `&` (use the harness background mode). After any `npm run build` in the MAIN tree, RESTART it (`lsof -ti:3100 | xargs kill -9 2>/dev/null` then `npm run dev`).
- BRANCHES: do NOT create/switch branches (a PreToolUse hook blocks it). Commit directly to `dev`. No PR unless asked.
- Conventional commits, English only, no emojis, no "Co-Authored-By". Update `/docs` when behaviour/architecture changes.

Chrome / auth: the app is Clerk-gated. First check existing browser tabs and reuse an already-authenticated Bridge tab if one is open; otherwise use the dev auth bypass — navigate to `GET /api/dev/bypass` (see `src/middleware.ts` / `src/app/api/dev/`), which authenticates the headless browser as the "global" dev user. If neither works, ask the PO to log in once in the tab you are driving. Never trigger native alert/confirm dialogs (they freeze the automation).

Ask the PO sparingly: decide for yourself using the story's recommended defaults and the tests. Only ask when something is genuinely unverifiable by tests or Chrome (a subjective visual call, a wrong default that changes scope, or you cannot authenticate Chrome). BATCH questions into one message; never ask permission to start/continue.

Pause, don't thrash: if after a couple of honest attempts a part won't go green, or the shared-component change regresses unrelated sprint-board / epic-children tests and the fix is non-obvious, STOP, leave the tree committed-or-clean (never a half-applied broken edit), note where you are stuck, and report it. Never loop indefinitely on the same failure.

When the story is done and archived: archive THIS handoff prompt too — `git mv docs/prompts/2026-06-30-brdg-441-inbox-header.md docs/user-stories/completed/` and commit `chore: archive handoff prompt 2026-06-30-brdg-441-inbox-header`. Skip this if the story is still blocked (leave the prompt in place).

At the end, report a summary in Dutch, understandable for a technical PO, concise and to the point: what shipped (with commit hashes), anything blocked and why, anything deferred or worth the PO's attention. No long prose.
```
