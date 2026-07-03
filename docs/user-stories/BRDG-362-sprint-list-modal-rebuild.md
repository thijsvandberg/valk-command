# BRDG-362: Rebuild the sprint list / select modal

**Status:** Implemented (awaiting PO verification)
**Priority:** Medium
**Type:** Feature / Refactor

> Refined 2026-07-03 with the PO; plan and approved decisions in
> [docs/plans/2026-07-03-brdg-362-sprint-list-unification.md](../plans/2026-07-03-brdg-362-sprint-list-unification.md).
> Implemented as one shared `SprintListBody` (manage / select / move variants) on a
> pure `src/lib/sprint-list.ts` core, with `SprintListModal`, `SprintPicker`,
> `SprintSelector` and the move-to-sprint flyout (`SprintSubPanel`) as thin shells.

## Description

The PO wants to rebuild (not just patch) the **sprint list/select modal** that opens from the Sprint Board pinned-tabs bar. Today it is a single popover (`SprintListModal`) that lists sprints in PINNED / ACTIVE & FUTURE / Backlog / CLOSED sections with search, a team filter, per-row pin/visibility toggles, and a "Sync sprints" footer.

The rebuild should make the modal a proper **sprint command surface**: see everything at a glance, place tickets at the top or bottom of a sprint when moving, and open a sprint directly from the list.

## Current Behaviour

- **`src/components/sprint-board/SprintListModal.tsx`** — the modal in the screenshot:
  - Search input + team filter button (lines ~474, ~482).
  - Sections: PINNED, ACTIVE & FUTURE, Backlog, CLOSED (lines ~544-594).
  - Each row shows: state dot, key/name, state badge (Active/Future), date range, people icon, eye (visibility) toggle, pin toggle (lines ~232-325).
  - Footer "Sync sprints" button (lines ~607-636) → `POST /api/jira/sync-sprints`.
  - Pinning persists via `/api/sprint-slots` (max 8 pinned); visibility persists via `PUT /api/jira/sprints` (`hidden_sprints`).
- There are **several other sprint pickers** that overlap and may be unified or left alone (decide in refinement):
  - `src/components/shared/SprintSelectDropdown.tsx`, `src/components/shared/SprintPicker.tsx`, `src/components/sprint-board/SprintSelector.tsx`.
- Data/types:
  - `Sprint` type — `src/types/ticket.ts` (~307-316): `id, name, dateRange, state (active|future|closed|backlog), ticketCount, startDate, endDate, goal`.
  - `useJiraSprints()` / `useSprintSlots()` — `src/hooks/useSprintBoard.ts`.
  - Move tickets — `POST /api/jira/move-sprint` already accepts `{ issueKeys, targetSprintId, position }` where **`position` supports `top`/`bottom`** (route.ts ~31, ~61-73). So top/bottom placement is already supported server-side.
  - Start/close sprint — `POST /api/jira/sprints/[id]/start` and `/close`.

## Requested improvements (PO, this round)

1. **See everything** — the modal should surface all sprints clearly (currently the closed/older ones are easy to miss). Work out how "everything" is presented without overwhelming: full visibility of pinned, active, future, backlog, and closed in one scrollable, scannable view.
2. **Top / bottom placement when moving** — when moving ticket(s) into a sprint from this modal, offer **"to top of sprint" vs "to bottom of sprint"** (server `position` already supports this; needs the UI affordance + the move entry point in the modal).
3. **Click a sprint to open it** — clicking a sprint row should **open that sprint** (navigate/select it on the board), distinct from the pin and visibility toggles. Define the click target vs. the icon actions so they don't conflict.
4. **...and much more** — to be expanded with the PO (see Open Questions).

## Open Questions / To work out

- **Scope of "rebuild":** restyle the existing `SprintListModal` in place, or replace it with a new component (and possibly consolidate the other sprint pickers)? Recommendation: decide after we list everything the modal must do.
- **Row click vs. icon actions:** what does a row click do (open sprint) and how do pin/eye/move stay reachable without accidental opens? (hover actions, explicit buttons, etc.)
- **Move flow:** where does "move ticket(s) here" start — is the modal opened in a "move mode" with selected tickets, or is move a per-row action? Where does the top/bottom choice appear (inline split button, submenu, drop zones)?
- **"See everything":** default expanded/collapsed state per section, closed-sprint depth, counts, and search/filter behaviour across all states.
- **Other sprint pickers:** keep separate or unify `SprintSelectDropdown` / `SprintPicker` / `SprintSelector` into one base.
- **Sprint actions in-modal:** start/close/create/edit-goal — should these live here too?
- **The "much more":** PO to enumerate the remaining wishes (grouping, per-team grouping, quick stats, keyboard nav, recent/favourite sprints, etc.).

## Acceptance Criteria

- [x] The modal shows all sprint states in one scannable view ("see everything"): pinned, active & future, backlog, closed (all synced, was capped at 5) and hidden, with counts per section.
- [x] Moving ticket(s) into a sprint offers a **top / bottom** placement choice (hover buttons per row in the move flyout; plain click keeps the BRDG-370 default) and uses `move-sprint` `position`. Reaches the board context menu, bulk bar, inbox and epic children through the shared menu panel.
- [x] Clicking a sprint row **opens that sprint** on the board, without colliding with the pin / visibility actions (icon clicks stop propagation; verified by tests).
- [x] One reusable component: `SprintListBody` (`src/components/shared/SprintListBody.tsx`) renders the modal (manage), the single-select pickers (select) and the move flyout (move); grouping/sorting/formatting logic lives once in `src/lib/sprint-list.ts`.

## Tests

- [x] Row click opens the sprint; pin / eye / stakeholder actions do not trigger an open (`SprintListBody.test.tsx`).
- [x] Move action sends the correct `position` (top/bottom) and suppresses the default `topKeys` placement rule (`useRowActions.test.ts`, `ticket-action-menu.test.tsx`).
- [x] Pure sprint-list logic unit-tested (`src/lib/sprint-list.test.ts`): sections, sorting, team filter, search, move destinations.
- [x] Converged pickers keep their contracts (`SprintPicker.test.tsx`, `SprintSelector.test.tsx`, `BulkActionBar.test.tsx`).

## Scope notes (decided 2026-07-03)

- `SprintSelectDropdown` (story writer launcher) stays as-is: it is a generic labeled-options dropdown (default/pinned sections fed by the launcher), not a sprint list. Candidate follow-up if it should visually converge too.
- Sprint lifecycle actions in the modal (start / close / create / edit goal) and the epic-writer `SprintPlacementMenu` are out of scope; candidate follow-up stories.

## Related

- [[BRDG-131-sprint-switcher-redesign]] — earlier sprint switcher redesign.
- [[BRDG-207-improve-sprint-sidebar]] — sprint sidebar improvements.
- [[BRDG-201-extract-base-picker]] — base picker the other sprint pickers use.
- [[BRDG-271-bulk-move-sprint-instant-board-update]] — bulk move + instant board update (top/bottom placement context).
- Code: `SprintListModal.tsx`, `SprintSelector.tsx`, `SprintPicker.tsx`, `SprintSelectDropdown.tsx`, `useSprintBoard.ts`, `/api/jira/move-sprint`, `/api/sprint-slots`, `/api/jira/sprints`.
