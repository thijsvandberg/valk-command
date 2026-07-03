# BRDG-362: Sprint list unification — one reusable sprint list body

**Date:** 2026-07-03
**Status:** Proposed (awaiting PO approval)
**Story:** [BRDG-362](../user-stories/BRDG-362-sprint-list-modal-rebuild.md)

## Explore findings (summary)

There are **seven** places where sprints are listed / selected / moved-to today:

| Surface | File | Used by | Fate in this plan |
|---------|------|---------|-------------------|
| SprintListModal | `src/components/sprint-board/SprintListModal.tsx` | Board header/views bar, ticket detail sidebar, refinement filters | Rebuilt on shared body (manage variant) |
| SprintPicker | `src/components/shared/SprintPicker.tsx` | Story writer MetaApp, refinement SessionTicketView | Rebuilt on shared body inside BasePicker popover |
| SprintSubPanel | `src/components/sprint-board/ticket-action-menu-sub-panels.tsx` | Context menu + bulk bar "Move to other sprint…" | Rebuilt on shared body (move variant, gains top/bottom) |
| SprintSelector | `src/components/sprint-board/SprintSelector.tsx` | No live call sites found (legacy) | Retire (move to `deleted/`) |
| SprintSelectDropdown | `src/components/shared/SprintSelectDropdown.tsx` | No live call sites found (legacy) | Retire (move to `deleted/`) |
| SprintPlacementMenu | `src/components/epic-writer/SprintPlacementMenu.tsx` | Epic writer child-story create/reassign | Out of scope (different semantics: "default sprint" / create placement); follow-up story |
| Inbox quick-move / bulk bar | `src/app/(app)/inbox/page.tsx` | Inbox | Inherits the new move variant via the shared action-menu panel |

Duplicated logic across them: state grouping (pinned / active & future / backlog / closed / hidden), sorting (pinned slot order, team prefix + sprint number), state badges and dots, date-range formatting, case-insensitive search, backlog entry (`__backlog__`).

Key facts from the data layer:
- `POST /api/jira/move-sprint` already supports `position: "top" | "bottom"` server-side; the board already calls it via `handleRankToEdge` (`SprintBoard.tsx:815-836`). Only the UI affordance in pickers is missing.
- Opening a sprint from the modal already works via `handleSprintListSelect` → `navigateToSprint` (`SprintBoard.tsx:741-762`); ephemeral (non-pinned) sprints are supported.
- Sprint volume is small (~10-40 incl. max 30 synced closed): **no virtualization needed**.
- Optimistic move updates go through the pending-move overlay (`ra.bulkMoveSprint`, BRDG-271) — the new move UI must keep using that path.
- Precedent: BRDG-381 unified the epic pickers around one `EpicPickerBody` rendered in both a popover and menus. This plan applies the same architecture to sprints.

## Design

### Layer 1 — pure sprint-list logic (`src/lib/sprint-list.ts`)

Extract the duplicated logic into unit-testable pure functions:
- `groupSprints(sprints, { pinnedIds, hiddenIds })` → sections: pinned, activeFuture, backlog, closed, hidden
- `sortSprints(sprints, pinnedSlotOrder)` → pinned slot order first, then team prefix + sprint number
- `filterSprints(sprints, query, teamFilter)`
- `formatSprintDateRange`, `sprintStateLabel`, `sprintStateColor` (one source of truth for badges/dots)

### Layer 2 — one shared body: `SprintListBody` (`src/components/shared/SprintListBody.tsx`)

One component that renders search + team filter + sections + rows, configured by variant:

| Variant | Shows | Row primary action | Row hover actions |
|---------|-------|--------------------|-------------------|
| `manage` | All sections incl. closed + hidden, counts, sync footer, team filter | Open sprint on board | Pin, hide/show, stakeholder view |
| `select` | Active & future (+ backlog, "No sprint"), search | Select (single or multi via checkboxes) | none |
| `move` | Active & future + backlog, search, excludes current/quick-move targets | Move here (default = bottom) | **"Top" / "Bottom"** placement buttons |

Shared behavior across variants: search, empty states, keyboard navigation (arrows + Enter + Escape), state badges, backlog row with count.

### Layer 3 — thin shells (existing containers, new inside)

- **Modal shell**: `SprintListModal` keeps its name, props, and call sites but its inside becomes `SprintListBody variant="manage"` (or `select`+multiSelect for the refinement filter use). Uses the shared `Modal`/z-index primitives.
- **Popover shell**: `SprintPicker` keeps its trigger variants (default/badge) but renders `SprintListBody variant="select"` inside its existing `BasePicker` popover.
- **Menu shell**: `SprintSubPanel` in the ticket action menu renders `SprintListBody variant="move"` — this is where **top/bottom placement** lands, and it automatically reaches the board context menu, bulk action bar, epic children rows, and inbox, because they all share the same action-menu content.

### BRDG-362 acceptance criteria mapping

1. **See everything** — `manage` variant shows all sections in one scrollable view; closed section header shows a count and expands to everything synced (up to 30); hidden section stays collapsed by default. Search flattens across all sections.
2. **Top/bottom on move** — in `move` variant, hovering a row reveals two small placement buttons ("Top" / "Bottom"); plain row click moves to bottom (today's default). Payload goes through the existing `ra.bulkMoveSprint` → `/api/jira/move-sprint` with `position`, keeping the optimistic overlay.
3. **Click to open** — in `manage` variant the row body opens the sprint (existing `handleSprintListSelect` path); pin/eye/stakeholder are separate hover buttons with `stopPropagation`, plus row-level keyboard focus so icon clicks can never trigger an open.

## Out of scope (explicit)

- Sprint lifecycle actions in the modal (start / close / create / edit goal) — candidate follow-up story.
- Epic writer `SprintPlacementMenu` convergence — different semantics (create placement, default sprint); candidate follow-up story.
- Any board DnD changes.

## Phases

**Phase 1 — foundation + modal rebuild**
- Create `src/lib/sprint-list.ts` with unit tests.
- Build `SprintListBody` (+ tests: variant rendering, row click vs icon actions, search, keyboard nav).
- Rebuild `SprintListModal` internals on the body; verify all three call sites (board, ticket detail, refinement filters) unchanged from the outside.

**Phase 2 — move variant + top/bottom**
- `SprintSubPanel` → `SprintListBody variant="move"`; wire `position` into the move handlers (context menu, bulk bar, inbox, epic children).
- Tests: correct `position` in the `/api/jira/move-sprint` payload; overlay still applied.

**Phase 3 — converge small pickers + retire legacy**
- `SprintPicker` → shared body inside BasePicker.
- Move `SprintSelector.tsx` and `SprintSelectDropdown.tsx` to `deleted/` (no live call sites; re-verify with grep before moving).
- Update `docs/architecture/` (component note) and the story file checkboxes.

Each phase is independently shippable; `npm run lint` / `typecheck` / `test` / `build` before each commit. The `frontend-design` skill is invoked before any frontend code is written.

## Open decisions for the PO

1. **Top/bottom affordance**: hover buttons on the row (proposed) vs. a per-row submenu. Hover buttons are one click; submenu is more discoverable but slower.
2. **Default placement on plain click in move mode**: bottom (proposed, matches today) or top.
3. **Closed sprints depth**: expand-to-all-synced (max 30, proposed) or keep "5 recent + show more".
4. **Refinement filter look**: keep using the full modal in multi-select mode (proposed) or switch it to the lighter `select` popover.
5. Anything for the story's "…and much more": quick stats per row (ticket count, goal tooltip), recent/favourite sprints, per-team grouping?
