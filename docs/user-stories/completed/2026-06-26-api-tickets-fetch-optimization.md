# Handoff prompt — `/api/tickets` whole-backlog fetch optimization (BRDG-411 → BRDG-412)

Scope: `all` from the originating thread, resolved to the two pending stories that thread produced.
Order: BRDG-411 (Fase 1) first, then BRDG-412 (Fase 2, depends on 411).
Generated: 2026-06-26.

Paste the block below into a fresh agent thread to run it autonomously.

```text
You are implementing stories BRDG-411 then BRDG-412 (the `/api/tickets` whole-backlog fetch optimization: Fase 1 = cheap wins, Fase 2 = on-demand hover lookup) end-to-end, AUTONOMOUSLY, one after another, on the `dev` branch of the Bridge (valk-command) project. This prompt is your standing approval to implement both without pausing to ask "shall I start?" per item. Commit your own work as you go, track progress, archive finished stories, and only advance once the current item is genuinely green. Keep going until both are done or you hit a real blocker.

Read first: `CLAUDE.md` (project + global rules); `docs/architecture/client-data-and-memory.md` (the fetch-discipline doc these stories follow — most important); `docs/investigations/2026-06-25-logging-audit.md` Thema F (why this work exists); `docs/architecture/optimistic-updates.md` if any change touches board edits; and each story's file in full before you start it.

Scope & order (do them in this order):
1. BRDG-411 — Fase 1 (cheap wins): stop the every-60s whole-backlog refresh and scope the pipelines multi-sprint view. File: `docs/user-stories/BRDG-411-bound-all-tickets-fetch.md`. Touches `src/hooks/useSprintBoard.ts` (the `useTickets` `refreshInterval`) and `src/app/(app)/pipelines/page.tsx`.
2. BRDG-412 — Fase 2 (the real fix): make the hover lookup on-demand (new `GET /api/tickets/hover` endpoint + a `useHoverData(keys)` hook) so no page pulls the whole backlog; scope the refinement callers. File: `docs/user-stories/BRDG-412-hover-lookup-on-demand.md`. Touches `src/hooks/useTicketHoverData.ts`, a new route, the hover consumers, and the refinement views.

Coupling & cautions:
- BRDG-412 DEPENDS ON BRDG-411 — do 411 first, get it fully green, then 412. Both work the ticket-fetch path (`useSprintBoard.ts` / `useTicketHoverData.ts`); they are sequential, never parallel. Re-run the FULL test suite between them.
- The working tree carries UNRELATED parallel-session work (e.g. `BRDG-394`, `BRDG-405`–`BRDG-410`, a `2026-06-26-refactor-reaudit.md` investigation, an edit to `completed/BRDG-378-*`). Do NOT touch, stage, or commit any of it. Stage EXPLICIT paths only.
- Do NOT re-touch the already-shipped logging series (BRDG-398..404, archived in `completed/`).

The loop for each item:
1. Read the item. If it has an "Open Questions"/"Approach" recommendation, follow the recommendation — do not stop to ask unless the default proves wrong/blocking once you are in the code.
2. Implement it. You may use the `/implement-story` command as the per-story harness. These are PERFORMANCE changes: preserve existing behaviour (hover cards, the board, the pipelines view, the refinement queue must all keep working) unless the story says otherwise; the tests are your guardrail; do not change behaviour beyond scope.
3. If anything visual changes, invoke the `frontend-design` skill first (global rule).
4. Write/extend co-located `*.test.ts(x)` tests for every change.
5. Verify it ACTUALLY works (the bar to advance — see "Definition of done").
6. Commit (conventional commit referencing the story ID; English; no emojis; NO "Co-Authored-By"). Stage EXPLICIT paths only — never `git add -A`/`.` (the tree carries unrelated work). Several commits per item is fine.
7. Tick the story's checkboxes as you satisfy them; when all are met, add a short "## Status" run note at the top and archive the story: move it to `docs/user-stories/completed/` and commit `chore: archive BRDG-XXX as completed`.
8. Only then move to the next item.

Definition of done (must ALL hold before advancing):
- `npm run lint`, `npm run typecheck`, `npx vitest run` (FULL suite), and `npm run build` all green.
- The story's acceptance criteria are met.
- It is E2E-verified in the REAL running app — not just unit tests:
  - UI items (hover cards, pipelines view): drive the affected view in Chrome via the available browser tools, confirm the behaviour and that the console shows no new errors. Navigate from the sprint board (click into a ticket / open a view), not by direct URL (direct URLs hit the Clerk redirect). Use the `verify` or `validate-ui` skill. For BRDG-411 specifically, confirm via the BRDG-404 slow-query stats (`GET /api/dev/query-stats` or the widget in Settings -> Integrations) that the recurring ~1s `GET /api/tickets` no longer fires on an idle page.
  - Backend item (BRDG-412's `/api/tickets/hover`): trigger the real route against the running dev server and confirm it returns ONLY hover fields for the requested keys and no server errors.

Hard rules (non-negotiable):
- TESTS: `npx vitest run` in the FOREGROUND, ONE process at a time, no pipes, no background, no sleep+cat polling. 16GB machine — concurrent vitest thrashes swap. A postToolUse hook may auto-run tests after edits; let it finish, do not overlap it.
- Run lint + typecheck + test + build before EVERY commit.
- DEV SERVER on port 3100 for Chrome checks: `curl -s localhost:3100` to see if it is up before starting; never start a second instance; never background it with `&`. After any `npm run build`, RESTART it (`lsof -ti:3100 | xargs kill -9 2>/dev/null` then `npm run dev`).
- BRANCHES: do NOT create/switch branches (a PreToolUse hook blocks it). Commit directly to `dev`. No PR unless asked.
- Conventional commits, English only, no emojis, no "Co-Authored-By". Update `/docs` when behaviour/architecture changes.

Chrome / auth: the app is Clerk-gated. First check existing browser tabs and reuse an already-authenticated Bridge tab if one is open; otherwise use the development auth bypass (check `src/middleware.ts` and `src/app/api/dev/` / `src/app/dev/` — a dev-only httpOnly cookie). If neither works, that is a valid reason to ask the PO to log in once in the tab you are driving. Never trigger native alert/confirm dialogs (they freeze the automation).

Ask the PO sparingly: decide for yourself using the story's recommended defaults and the tests. Only ask when something is genuinely unverifiable by tests or Chrome (a subjective product/visual call, a wrong default that changes scope, or you cannot authenticate Chrome). BATCH questions into one message; keep working on anything unblocked; never ask permission to start/continue.

Pause, don't thrash: if after a couple of honest attempts an item won't go green, or a shared-file change regresses unrelated tests and the fix is non-obvious, STOP that item, leave the tree committed-or-clean (never a half-applied broken edit), note where you are stuck, and continue with the next INDEPENDENT item. (Note: 412 depends on 411, so if 411 is blocked, 412 is blocked too — report and stop.) Never loop indefinitely on the same failure.

At the end, report a summary in Dutch, understandable for a technical PO, concise and to the point: which stories shipped (with commit hashes), which are blocked and why, anything deferred or worth the PO's attention. No long prose.
```
