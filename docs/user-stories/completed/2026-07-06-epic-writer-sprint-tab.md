# Handoff prompt — BRDG-486 Epic Writer sprint-planning tab

Paste the block below into a fresh Claude Code thread in the `valk-command` project to run autonomously.

```text
You are implementing story BRDG-486 (Epic Writer sprint-planning tab + breakdown sprint indicators) end-to-end, AUTONOMOUSLY, on the `dev` branch of the Bridge (valk-command) project. This prompt is your standing approval to implement it without pausing to ask "shall I start?". Commit your own work as you go, track progress, archive the story when done, and keep going until it is done or you hit a real blocker.

BEFORE YOU START — clean baseline (mandatory): this story touches files that recent Epic Writer work (BRDG-484/485) also changed. The working tree may still carry uncommitted parallel work. Run `git status` first. If the tree is dirty with changes you did not make (e.g. modified `EpicWriterLayout.tsx`, `ChatMessageParts.tsx`, a `useEpicWriterContext.ts` -> `deleted/` rename, an untracked `BRDG-485`), STOP and report — do not build on a half-applied tree. Only proceed when `dev` is clean and the FULL suite is green.

Read first: `CLAUDE.md` (project + global rules); the story `docs/user-stories/BRDG-486-epic-writer-sprint-planning-tab.md` in full; `docs/architecture/optimistic-updates.md` (this story moves child issues between sprints — board-edit territory, read it before wiring moves); `docs/user-stories/completed/BRDG-484-epic-writer-layout-navigation.md` for the Epic Writer layout model (the right region uses `EpicRightView = "breakdown" | "draft" | "child"`, an `EpicAppsMenu` switcher, and a `handleSelectPhase` that maps phases to views); and the REUSE targets `src/components/ticket-detail/EpicChildrenBySprint.tsx` + `src/components/ticket-detail/TicketTabContent.tsx` to see exactly how the epic single view feeds children + sprints + move handlers into `EpicChildrenBySprint` (you will wire the same plumbing into the Epic Writer, not fork it).

Scope & order (single item):
1. BRDG-486 — Epic Writer sprint-planning tab + breakdown sprint indicators — `docs/user-stories/BRDG-486-epic-writer-sprint-planning-tab.md`. Add a "sprints" view to the Epic Writer that REUSES `EpicChildrenBySprint` (the epic single view) so the PO can move created child stories into sprints/backlog without leaving the writer; make the tab bar freely navigable both ways (Sprints <-> Breakdown); and show on each created breakdown card which sprint it is scheduled in (badge on `ChildStoryCard.tsx`).

Key implementation notes:
- Add `"sprints"` to `EpicRightView`, to the `EpicAppsMenu` switcher, and map the Sprints phase to it in `EpicWriterLayout.tsx`'s `handleSelectPhase`.
- The Sprints view needs the epic's REAL Jira children (created stories) + the sprint list, NOT the breakdown DRAFT cards. Fetch/derive them the same way the epic single view does (see `TicketTabContent.tsx`; children likely via the epic tickets route). Feed `EpicChildrenBySprint`'s existing handlers (`onMoveChild`, reorder, etc.) so moves persist to Jira via the existing sprint-move plumbing. Do NOT reimplement sprint moves.
- DRAFT (uncreated) breakdown cards are not schedulable and must not appear in the Sprints view — keep that constraint.
- The breakdown sprint indicator: `ChildStoryCard.tsx` already resolves a created card's live sprint; surface it clearly as a badge (and "backlog / not scheduled" otherwise).

Cautions (respect exactly):
- REUSE, don't fork: `EpicChildrenBySprint` is a heavy shared component (dnd, BoardRow, sprint-board plumbing). Use it as-is; do not copy it into the epic-writer folder.
- Shared files: `EpicWriterLayout.tsx`, `EpicAppsMenu.tsx`, `ChildStoryCard.tsx` were recently edited by BRDG-484/485 — make sure those are committed and green before you start (see clean-baseline gate above).
- Do not change how the Story Writer works; the epic writer reuses story-writer/ticket-detail pieces but must not regress them.

The loop:
1. Read the story. It has an "Open questions" section with a recommended default (keep "Create in Jira" on the Breakdown board; the Sprints view only plans already-created stories) — follow the default unless it proves wrong/blocking once you're in the code.
2. Implement it. You may use the `/implement-story` command as the harness. This is a feature that REUSES existing components: preserve existing behaviour; the tests are your guardrail; do not change behaviour beyond scope.
3. If anything visual changes, invoke the `frontend-design` skill first (global rule) — this story is UI.
4. Write/extend co-located `*.test.ts(x)` tests: the Sprints view renders created children grouped by sprint, a move calls the sprint-move handler, DRAFT cards are excluded, tab navigation Sprints<->Breakdown works, and the breakdown card shows its sprint badge.
5. Verify it ACTUALLY works (the bar to advance — see "Definition of done").
6. Commit (conventional commit referencing BRDG-486; English; no emojis; NO "Co-Authored-By"). Stage EXPLICIT paths only — never `git add -A`/`.` (the tree carries unrelated parallel work, including some deleted story docs — never stage those). Several commits are fine.
7. Tick the story's checkboxes as you satisfy them; when all are met, add a short "## Status" run note at the top and archive it: move `docs/user-stories/BRDG-486-epic-writer-sprint-planning-tab.md` to `docs/user-stories/completed/` and commit `chore: archive BRDG-486 as completed`.

Definition of done (must ALL hold):
- `npm run lint`, `npm run typecheck`, `npx vitest run` (FULL suite), and `npm run build` all green.
- The story's acceptance criteria are met.
- E2E-verified in the REAL running app, not just unit tests: in Chrome, open the Epic Writer for an epic that has created child stories (e.g. `VPL-47279`), switch to the Sprints tab, move a child into a sprint and confirm it persists (re-open / check the sprint), navigate back to Breakdown and confirm the card shows its sprint badge, and confirm no new console errors. Navigate from the sprint board (open the epic writer), not by direct URL (direct URLs hit the Clerk redirect). Use the `verify` or `validate-ui` skill.

Hard rules (non-negotiable):
- TESTS: `npx vitest run` in the FOREGROUND, ONE process at a time, no pipes, no background, no sleep+cat polling. 16GB machine — concurrent vitest thrashes swap. A postToolUse hook may auto-run tests after edits; let it finish, don't overlap it.
- Run lint + typecheck + test + build before EVERY commit.
- DEV SERVER on port 3101 for Chrome checks (prod is 3100): `curl -s localhost:3101` to see if it's up before starting; never start a second instance; never background it with `&`. After any `npm run build`, RESTART it (`lsof -ti:3101 | xargs kill -9 2>/dev/null` then `npm run dev`).
- BRANCHES: do NOT create/switch branches (a PreToolUse hook blocks it). Commit directly to `dev`. No PR unless asked.
- Conventional commits, English only, no emojis, no "Co-Authored-By". Update `/docs` when behaviour/architecture changes.

Chrome / auth: the app is Clerk-gated. First check existing browser tabs and reuse an already-authenticated Bridge tab if one is open; otherwise use the development auth bypass (`GET /api/dev/bypass` on the dev server; check `src/middleware.ts` and `src/app/api/dev/` / `src/app/dev/` — a dev-only httpOnly cookie). `VPL-47279` is a real epic with an active writer session and created children. If auth can't be established, that's a valid reason to ask the PO to log in once in the tab you're driving. Never trigger native alert/confirm dialogs (they freeze the automation).

Ask the PO sparingly: decide for yourself using the story's recommended default and the tests. Only ask when something is genuinely unverifiable by tests or Chrome (a subjective product/visual call, a wrong default that changes scope, or you can't authenticate Chrome). BATCH questions into one message; keep working on anything unblocked; never ask permission to start/continue.

Pause, don't thrash: if after a couple of honest attempts it won't go green, or reusing `EpicChildrenBySprint` in the writer regresses unrelated ticket-detail / sprint-board tests and the fix is non-obvious, STOP, leave the tree committed-or-clean (never a half-applied broken edit), note where you're stuck, and report. Never loop indefinitely on the same failure.

When done: archive this handoff prompt itself — `git mv docs/prompts/2026-07-06-epic-writer-sprint-tab.md docs/user-stories/completed/` and commit `chore: archive handoff prompt epic-writer-sprint-tab`. Skip this if the story is blocked (leave the prompt in place so the next run can pick it up).

At the end, report a summary in Dutch, understandable for a technical PO, concise and to the point: what shipped (with commit hash), anything blocked and why, anything deferred or worth the PO's attention. No long prose.
```
