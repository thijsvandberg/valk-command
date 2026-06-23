# BRDG-384: Carry Unhandled Tickets Over to a Next Refinement

**Status:** Ready for build (PO decisions resolved 2026-06-23)
**Priority:** TBD
**Type:** Story
**Builds on:** BRDG-170 (refinement session v2), BRDG-166 (saved refinement sessions), BRDG-336 (drag ticket onto another session), BRDG-337 (schedule refinement session with date)

## Description

As the PO, at the end of a refinement session I want to easily push the tickets we did not finish refining over to a next refinement session, so the leftovers are queued for next time instead of silently disappearing when I complete the session.

Today the **Wrap Up Session** modal (`SessionEndModal`) lists every ticket that was in the session and lets me Save (status `in_progress`) or Complete (status `completed`). On Complete the session is closed and its queue is frozen as-is. There is no way to take the tickets that were not actually refined and move them forward; I would have to remember them and re-add them by hand on the overview page next session.

This story adds a carry-over step to the wrap-up flow: select the unhandled tickets and send them into a follow-up session (a new one, or an existing draft/scheduled session).

## What counts as "unhandled"

The session has no explicit "refined" flag, but the wrap-up already surfaces enough signal to pre-select sensible candidates:

- The ticket was never reached (its queue position is beyond `currentIndex`).
- It has no estimate (`storyPoints` null/0 and not a spike) — already shown as the **No estimate** badge.
- It has no subtasks (`subtaskCount === 0`) — already shown as the **No subtasks** badge.
- It is still in a non-ready state (e.g. status not advanced, `readiness` still `ready_to_refine` / not cleared).

Every row in the wrap-up modal gets a carry-over checkbox; rows matching the "unhandled" heuristic above are **pre-checked** by default, and the PO can override the selection freely.

## Proposed UX (in the Wrap Up modal)

1. Each ticket row gets a carry-over toggle (checkbox/affordance) in the existing row layout next to the PO-message button.
2. A summary line + bulk control: "Carry N tickets to next refinement" with select-all / select-none for the flagged set.
3. A target picker for where the carried tickets go:
   - **New session** (default) — creates a follow-up session, reusing the BRDG-337 create flow. The PO is **prompted for a date** so the follow-up is scheduled; default name pattern consistent with existing create (`Refinement YYYY-MM-DD`).
   - **Existing session** — pick any ready (`draft` / `in_progress`, not `completed`) session, reusing the same target list as BRDG-336's "move to session".
4. Carry-over applies on **both Save and Complete**: the selected tickets are appended to the target session's `ticketKeys` (deduped) and **removed from this session's queue**, then this session is saved (`in_progress`) or completed as usual. A toast confirms "Carried N tickets to {session name}".

## Implementation Plan

Carry-over writes happen **directly in `SessionEndModal`** before calling `saveSession`/`finishSession` (no context-surface widening). Source-queue removal is **persist-only** (PATCH remaining `ticketKeys`); the live in-memory context queue is not mutated because the modal navigates away (unmounts the session subtree) immediately after.

1. **Wire `currentIndex` into the modal** — add it to the `useRefinementSession()` destructure (already exposed by the context). Feeds the "never reached" heuristic (`index > currentIndex`).
2. **Bring sessions + toast into the modal** — `useRefinementSessions()` for the target list; show the "Carried N…" toast via a `sessionStorage` handoff (`bridge:refinement-toast`) read once on `RefinementPageContent` mount, since the modal navigates away before a local toast would render. Both overview routes (`/refinement`, `/refinement/[sessionId]`) render `RefinementPageContent`.
3. **Compute the unhandled heuristic** — extend `ticketRows` to carry its queue `index`; derive `isUnhandled = neverReached || noEstimate || noSubtasks || (readiness === "ready_to_refine")`. Seed a `carriedKeys: Set<string>` from unhandled rows once `allTickets` has loaded (ref-guarded effect, like `seededPoNotesRef`). Refined rows and spikes-with-points are not pre-selected.
4. **Carry-over selection UI** — per-row checkbox bound to `carriedKeys`, plus a summary line with select-all / select-none. Shown above the ticket list.
5. **Target picker UI** — shown only when `carriedKeys.size > 0`: "New session" (default) vs "Existing session". Existing list = `sessions.filter(s => s.id !== savedSessionId && s.status !== "completed").sort(compareSessions)` rendered with `sessionLabel`. New = a `DateTimePicker` (prompt for date) with default name `Refinement {date}`.
6. **`applyCarryOver()` helper** — no-op when `carriedKeys.size === 0`. Otherwise: split queue into `carried`/`remaining`; for existing target `update(target.id, { ticketKeys: dedupe([...target.ticketKeys, ...carried]) })`; for new target `create({ name, scheduledFor, ticketKeys: carried })`; then `update(savedSessionId, { ticketKeys: remaining })`; `mutateSessions()`; stash toast message.
7. **Hook into Save and Complete** — sequence in `handleSave`/`handleFinish`: `await flushPendingNotes()` → `await applyCarryOver()` → existing `saveSession`/spike-promotion+`finishSession` → `router.push`.
8. **Tests** — extend `SessionEndModal.test.tsx` (mock `useRefinementSessions`, add target sessions) and add the toast-handoff read to `RefinementPageContent` (covered by its existing test patterns).

## Acceptance Criteria

- [ ] The wrap-up modal lets me select which tickets to carry to a next refinement
- [ ] Tickets matching the unhandled heuristic are pre-selected, and I can override the selection freely
- [ ] I can choose the target: a new follow-up session, or an existing ready session
- [ ] Creating a new follow-up session reuses the existing create flow and prompts for a date — no parallel create path
- [ ] Save and Complete both append the selected tickets to the target session (deduped, optimistic UI) and remove them from this session's queue
- [ ] A toast confirms how many tickets were carried and to which session
- [ ] Carrying zero tickets behaves exactly like today's Save/Complete (no empty session created, no target prompt forced)

## Decisions (PO, 2026-06-23)

1. **Default selection:** the heuristic "unhandled" set is pre-selected; the PO can override per ticket.
2. **Strip from completed session:** carried tickets are **removed** from this session's queue when carried over.
3. **Save vs Complete:** carry-over applies on **both** — Save pushes leftovers forward and keeps this session open; Complete pushes them forward and closes it.
4. **New-session timing:** creating a follow-up session **prompts for a date** (schedules it, per BRDG-337).

## Technical Notes

- Primary file: `src/components/refinement-session/SessionEndModal.tsx`. It already computes `ticketRows` with `storyPoints`, `subtaskCount`, `readiness`, `isSpike`, and `unestimatedCount` — the heuristic inputs are already in hand. `currentIndex` (reached-or-not) comes from `RefinementSessionContext`.
- Session writes go through `refinementSessionsApi` (`src/lib/api-client`): `update(id, { ticketKeys })` (PATCH `/api/refinement-sessions/[id]`) to append to an existing target; create (POST `/api/refinement-sessions`) for a new follow-up. Per BRDG-336/337 the create endpoint requires a name or date — reuse `CreateSessionModal` / the same default-name logic, do not add a new endpoint.
- Target session list + the "ready session" filter (exclude `completed`) already exist for BRDG-336's move-to-session; reuse that source rather than re-deriving it.
- Dedupe when appending so a ticket already in the target session is a no-op (mirror BRDG-336's duplicate handling).
- Both exit paths in `SessionEndModal` (`handleSave` → `saveSession`, `handleFinish` → `finishSession`) must run carry-over: append to the target, strip the carried keys from this session's `ticketKeys`, and flush like the existing `flushPendingNotes` so nothing is lost on navigation. Removing carried keys from the source means a PATCH of this session's `ticketKeys` too.
- Relevant files: `SessionEndModal.tsx`, `RefinementSessionContext.tsx`, `CreateSessionModal.tsx`, `SavedSessionList.tsx`, `RefinementPageContent.tsx` (move-to-session/create reuse).

## Tests

- [ ] Heuristic pre-selects the right rows (no estimate / no subtasks / not reached / not ready) and skips fully-refined rows and spikes-with-points
- [ ] Selecting/deselecting rows updates the carry-over count
- [ ] Save and Complete both append the selected tickets to the target and remove them from this session's queue
- [ ] New target creates one follow-up session (with the chosen date) containing exactly the selected tickets
- [ ] Existing target appends selected tickets, deduped against its current queue
- [ ] Carrying zero tickets is identical to today's Save/Complete (no session created, queue untouched)
- [ ] Toast reports the correct count and target name
- [ ] Pending PO notes still flush correctly when carry-over runs

## Dependencies

None blocking. Coordinate with the BRDG-336 move-to-session / BRDG-337 create-with-date code paths to reuse, not duplicate, the target-session list and create flow.
