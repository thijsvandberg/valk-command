# BRDG-389: Refinement list and cleanup list adopt the shared BoardRow

**Status:** Not Started
**Priority:** Medium
**Type:** Refactoring

## Description

As a developer, I want the **refinement ticket list** (`RefinementTicketList`) and the **cleanup list** (`/cleanup`) to render their rows through the shared `BoardRow` instead of `ChildIssueRow`, continuing the row-unification started in **BRDG-367** (epic-children) and proposed in **BRDG-388** (Compare view).

> **Note on the inbox:** the request mentioned "refinement / inbox / cleanup", but the **inbox already renders through `BoardRow`** (it has been a `BoardRow` host since before BRDG-367 and imports `ChildIssueRow` zero times). So the inbox needs no migration and is excluded here. This story covers the two lists that still use `ChildIssueRow`: refinement and cleanup.

These two are the **easiest** of the remaining `ChildIssueRow` hosts, because (unlike subtasks and linked issues) they do **not** use `actionsSlot` (no per-row edit/delete/unlink buttons) and do **not** use inline rename. Their only real gap vs `BoardRow` is two layout variants.

## The shared challenge: two layout variants `BoardRow` lacks

Both lists render `ChildIssueRow` with:

- **`spacious`** — extra vertical padding (`py-[10px]` vs the default `py-[7px]`), a slightly more relaxed list.
- **`inlineCheckbox`** — the selection checkbox is **always visible in the content flow**, not hover-revealed and not pinned only while a selection is active. (In refinement this is deliberate so the BRDG-336 "drag into queue" handle stays usable while tickets are checked.)

`BoardRow` has neither: it uses a fixed row height and a checkbox gutter that only appears on hover or when a selection is active. So the first step is to add these two as opt-in, host-inert props to `BoardRow` (default off, so the board / inbox / Story Writer / epic views are unaffected), the same way BRDG-367 added `subtaskCounts` / `showKey` / `showStatus`.

## Per-host notes

### Cleanup (`/cleanup`) — simplest, do first
- Renders a **selectable static list** (no drag-and-drop) of `Subtask`-shaped items, mapped to the shared pill (`src/app/(app)/cleanup/page.tsx`, see the "Subtask-shaped item" mapping comment).
- Needs a small `*->Ticket` adapter (mirror `epicChildToTicket`), plus `spacious` + `inlineCheckbox` on `BoardRow`, plus the per-card `<table><tbody>` wrap.
- No DnD, no `actionsSlot`, no inline edit -> lowest risk.

### Refinement (`RefinementTicketList`) — one extra wrinkle
- The "available tickets" list already feeds `ChildIssueRow` a **full `Ticket`** (`item={ticket}` with SP/BV/assignee/etc.) and an explicit `hoverData` block, so **little or no adapter** is needed.
- Uses `spacious` + `inlineCheckbox` + `metadataSlot` + the full edit callbacks (`onAssigneeChange` / `onEpicChange` / `onSprintChange` / `onStoryPointsChange` / `onBusinessValueChange`), all of which `BoardRow` already supports as props.
- **The wrinkle:** `dragHandleSlot={<TicketDragHandle source="list" />}` is a *custom* "drag this ticket into the refinement queue" handle (BRDG-336), **not** row reorder. `BoardRow`'s drag affordance is its own built-in grip tied to `SortableBoardRow` (reorder). So either:
  1. `BoardRow` gains an optional **external drag-handle slot** for this cross-list drag, or
  2. the refinement list keeps the `TicketDragHandle` adjacent to `BoardRow` (outside it), not inside the row.
  This needs a small decision during implementation.
- The queue side (`SortableQueueItem`) and its DnD are separate and out of scope unless they also render `ChildIssueRow`.

## Preconditions

- [ ] BRDG-367 merged (the `BoardRow` reuse pattern is in place).
- [ ] Clean working tree; commit each phase as its own logical unit.

## Phase 1: Add `spacious` + `inlineCheckbox` to `BoardRow`

- [ ] Add `spacious?: boolean` (extra row padding) and `inlineCheckbox?: boolean` (always-visible in-flow checkbox) to `BoardRow`, both default-off and inert for existing hosts.
- [ ] Unit-test the two variants on `BoardRow`; confirm no visual change for the board / inbox / Story Writer / epic hosts.

## Phase 2: Migrate the cleanup list

- [ ] Add a `*->Ticket` adapter for the cleanup items (or reuse one if a Subtask adapter exists).
- [ ] Render the cleanup list rows via `BoardRow` inside a per-card `<table><tbody>`, with `spacious` + `inlineCheckbox`.
- [ ] Preserve selection, the metadata shown, and any cleanup-specific behaviour at the page level.
- [ ] Remove `ChildIssueRow` from `src/app/(app)/cleanup/page.tsx`.
- [ ] Update cleanup tests; `npm run verify` + `npm run build` green; PO visual check.

## Phase 3: Migrate the refinement list

- [ ] Decide the drag-handle approach (external slot on `BoardRow` vs handle adjacent to the row) and implement it.
- [ ] Render `RefinementTicketList` rows via `BoardRow` (`spacious` + `inlineCheckbox`), wiring the existing edit callbacks straight through; drop the explicit `hoverData` if `BoardRow` derives it adequately.
- [ ] Preserve the "drag ticket into queue" behaviour (BRDG-336) and selection.
- [ ] Remove `ChildIssueRow` from `RefinementTicketList`.
- [ ] Update refinement tests; `npm run verify` + `npm run build` green; PO visual + drag check.

## Acceptance Criteria

- [ ] The cleanup list and the refinement available-tickets list render rows via `BoardRow`.
- [ ] `ChildIssueRow` is no longer imported by the cleanup page or `RefinementTicketList`.
- [ ] Selection, metadata, and the refinement "drag into queue" affordance behave as before.
- [ ] No regression on the other `BoardRow` hosts (board, inbox, Story Writer, epic-children).
- [ ] `npm run verify` and `npm run build` pass.

## Out of scope

- The **inbox** (already on `BoardRow`).
- `ChildIssueRow`'s harder hosts: **subtasks** (`SubtasksSection`) and **linked issues** (`LinkedIssueRow`) — they use `actionsSlot` and/or inline rename, which `BoardRow` lacks; a separate follow-up.
- The Compare view's legacy `TicketRow` (covered by BRDG-388).
- The refinement **queue** ordering DnD, unless it turns out to render `ChildIssueRow` too.

## References

- [BRDG-367: Epic-children list adopts the shared BoardRow](completed/BRDG-367-epic-children-adopt-board-row.md) — the precedent (adapter + `<table>` wrap + opt-in `BoardRow` props).
- [BRDG-388: Compare view adopts the shared BoardRow](BRDG-388-compare-view-adopt-board-row.md) — sibling migration.
- [docs/investigations/2026-06-17-unified-issue-row.md](../investigations/2026-06-17-unified-issue-row.md) — original row-unification analysis.
