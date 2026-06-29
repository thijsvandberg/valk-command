# Handoff prompt — BRDG-423 (data-state coverage)

Generated 2026-06-27. Scope: a single story, **BRDG-423**. BRDG-418 (undefined surface tokens) is
already done and is **out of scope**. Paste the fenced block below into a fresh agent thread.

```text
You are implementing story BRDG-423 — "Standardize data-state coverage (loading / empty / error)" —
end-to-end, AUTONOMOUSLY, on the `dev` branch of the Bridge (valk-command) project. This prompt is your
standing approval to implement it without pausing to ask "shall I start?". Commit your own work as you
go, track progress, archive the story when done, and only finish once it is genuinely green. Keep going
until it is done or you hit a real blocker.

Read first:
- `CLAUDE.md` (project + global rules).
- The story in full: `docs/user-stories/BRDG-423-data-state-coverage.md`.
- `docs/architecture/client-data-and-memory.md` — this story touches SWR fetches and list views; follow
  its rules (no whole-backlog fetches, bounded cache, virtualize growable lists).
- The reference implementation to emulate: `src/components/chat/ConversationList.tsx` — it is the only
  surface already using LoadingState + EmptyState + InlineAlert together correctly. Match its pattern.

Scope & internal order (it is ONE story; do the sub-steps in this order, lowest-risk-of-regression and
highest-value first):
1. ERROR VISIBILITY (the functional fix — do this first). Make every primary data view surface a
   visible, recoverable error on fetch failure. SWR does not throw, so the ErrorBoundary/error.tsx layer
   never catches a failed fetch — each surface must read SWR's `error` and render it. Adopt a small
   convention/wrapper (treat ConversationList as the template). Concretely:
   - Remove the swallow in `src/app/(app)/stakeholder/page.tsx:51` (`.catch(() => null)`) so failures are
     distinguishable from "no data," and render an error state there.
   - Wire the unused `error` from the SWR hooks behind Sprint Board (`useTickets`), Inbox
     (`inbox/page.tsx`), Epics (`useEpicProgress`), Pipelines (`usePipelines`), Activity Log, and People
     into an inline `InlineAlert` (inline failures) or an `EmptyState`-with-retry (full-view failures).
   - Fix `src/components/stakeholder/StakeholderSprintCards.tsx:70` where `LoadingState` is misused as an
     empty state ("No sprint selected") — use `EmptyState` instead.
2. EMPTY STATES. Replace the bespoke local empties with the shared `shared/EmptyState.tsx`: delete the
   local variants in `inbox/page.tsx:645-672` and `cleanup/page.tsx:983-1002`, and the two inline
   dashed-border variants in `epics/page.tsx:133-153`. Sweep the ~45 bare-text "No X" empties in
   ticket-detail and story-writer panes toward `EmptyState` (icon + title + optional CTA). Pick one copy
   tone (imperative vs passive) and apply it.
3. SKELETONS. Collapse the four hand-rolled opacity-fade row skeletons (constants i*0.12 Inbox, i*0.1
   Cleanup page, i*0.07 Cleanup route, i*0.14 Epics) into the shared `shared/Skeleton.tsx`
   (`Skeleton`/`SkeletonRow`) with ONE fade constant. Route the bespoke page/route skeletons through it.
4. SETTINGS. Normalize the Settings sub-pages that use bare "Loading…"/"No X" strings + silent `.catch`
   (Scheduler, People, Prompts, Deprecated-Areas) onto the shared LoadingState/EmptyState/InlineAlert
   trio — match `settings/jobs/JobsPanel.tsx`, which already does it right.
5. ERROR COPY. Unify the three near-identical error-boundary messages (`error.tsx`, `global-error.tsx`,
   `ErrorBoundary.tsx`) into one shared message.

Couplings & cautions baked in for this thread:
- `InlineAlert` currently HARDCODES its colors (raw red/amber/blue) — that is a SEPARATE story
  (BRDG-419) and is NOT yet done. ADOPT `InlineAlert` as-is for error banners here; do NOT re-color it
  or rewrite it onto status tokens — that is out of scope and would collide with BRDG-419.
- `inbox/page.tsx`, `cleanup/page.tsx`, `epics/page.tsx`, and `EpicChildrenSection.tsx` are also touched
  by the board stories BRDG-415/416. If you find uncommitted work in those files (the tree may carry
  parallel work), STOP and ask before editing them — do not stage unrelated changes. Stage explicit
  paths only.
- This is a reliability + consistency hardening story: preserve existing behaviour except where the
  story explicitly adds an error/empty/loading state. The tests are your guardrail.

The loop for this story:
1. Read the story in full. It has an "Open Questions"/recommended-defaults flavour in the Proposed
   approach — follow the recommendations (e.g. inline banner vs full retry screen per the story); do not
   stop to ask unless a default proves wrong/blocking once you are in the code.
2. Implement it. You may use the `/implement-story` command as the per-story harness.
3. Anything visual changes here (error/empty/skeleton UI) — invoke the `frontend-design` skill FIRST
   (global rule) before writing the UI.
4. Write/extend co-located `*.test.ts(x)` tests for every change.
5. Verify it ACTUALLY works in the real running app (see Definition of done).
6. Commit (conventional commit referencing BRDG-423; English; no emojis; NO "Co-Authored-By"). Stage
   EXPLICIT paths only — never `git add -A`/`.`. Several commits is fine (e.g. one per sub-step 1-5).
7. Tick the story's checkboxes as you satisfy them; when all are met, add a short "## Status" run note
   at the top, then archive: move the file to `docs/user-stories/completed/` and commit
   `chore: archive BRDG-423 as completed`.

Definition of done (must ALL hold):
- `npm run lint`, `npm run typecheck`, `npx vitest run` (FULL suite), and `npm run build` all green.
- The story's acceptance criteria are met.
- E2E-verified in the REAL running app, not just unit tests:
  - Drive each affected view in Chrome via the browser tools. Confirm the loading/empty states render,
    and crucially that a FORCED fetch failure shows a visible, recoverable error (not a blank screen) —
    e.g. block the relevant /api request or point it at a bad path and reload. Confirm the console shows
    no new errors. Navigate from the sprint board (click into views/tickets), not by direct URL (direct
    URLs hit the Clerk redirect). Use the `verify` or `validate-ui` skill.

Hard rules (non-negotiable):
- TESTS: `npx vitest run` in the FOREGROUND, ONE process at a time, no pipes, no background, no
  sleep+cat polling. 16GB machine — concurrent vitest thrashes swap. A postToolUse hook may auto-run
  tests after edits; let it finish, don't overlap it.
- Run lint + typecheck + test + build before EVERY commit.
- DEV SERVER on port 3100 for Chrome checks: `curl -s localhost:3100` to see if it's up before starting;
  never start a second instance; never background it with `&`. After any `npm run build`, RESTART it
  (`lsof -ti:3100 | xargs kill -9 2>/dev/null` then `npm run dev`).
- BRANCHES: do NOT create/switch branches (a PreToolUse hook blocks it). Commit directly to `dev`. No PR
  unless asked.
- Conventional commits, English only, no emojis, no "Co-Authored-By". Update `/docs` when
  behaviour/architecture changes.

Chrome / auth: the app is Clerk-gated. First check existing browser tabs and reuse an already-
authenticated Bridge tab if one is open; otherwise use the development auth bypass (check
`src/middleware.ts` and `src/app/api/dev/` / `src/app/dev/` — a dev-only httpOnly cookie; GET
`/api/dev/bypass` sets it). If neither works, that's a valid reason to ask the PO to log in once in the
tab you're driving. Never trigger native alert/confirm dialogs (they freeze the automation).

Ask the PO sparingly: decide for yourself using the story's recommended defaults and the tests. The one
genuine product call worth confirming if you are unsure: for each failing view, is an inline error
banner or a full-view retry screen the right treatment? — make a reasonable default per the story and
note it; only ask if a choice meaningfully changes scope. BATCH any questions into one message; keep
working on anything unblocked; never ask permission to start/continue.

Pause, don't thrash: if after a couple of honest attempts a sub-step won't go green, or a shared-file
change (error.tsx / ErrorBoundary.tsx) regresses unrelated tests and the fix is non-obvious, STOP that
sub-step, leave the tree committed-or-clean (never a half-applied broken edit), note where you're stuck,
and continue with the next INDEPENDENT sub-step (steps 2-5 are largely independent of each other).
Report blocked items at the end. Never loop indefinitely on the same failure.

At the end, report a summary in Dutch, understandable for a technical PO, concise and to the point:
which sub-steps shipped (with commit hashes), which are blocked and why, anything deferred or worth the
PO's attention. No long prose.
```
