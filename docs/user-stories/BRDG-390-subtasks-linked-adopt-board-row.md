# BRDG-390: Subtasks and linked-issues lists adopt the shared BoardRow

**Status:** Not Started
**Priority:** Low
**Type:** Refactoring

## Description

As a developer, I want the **subtasks list** (`SubtasksSection`) and the **linked-issues list** (`LinkedIssuesSection` -> `LinkedIssueRow`) on the ticket-detail page to render through the shared `BoardRow` instead of `ChildIssueRow`, finishing the row-unification series (BRDG-367 epic-children, BRDG-388 Compare, BRDG-389 refinement + cleanup).

These are the **last and hardest** `ChildIssueRow` hosts. They are hard precisely because they lean on the slot flexibility that `BoardRow` deliberately does not have. So this story is **not** a copy of BRDG-367: it starts with a genuine go/no-go decision about whether the payoff is worth growing `BoardRow`.

## Why these two are hard

`ChildIssueRow` is a thin shell with open slots (`metadataSlot` / `actionsSlot` / `dragHandleSlot`) plus an inline-edit mode; `BoardRow` is a fat, board-tuned row with fixed props and no generic action/inline-edit affordance. Subtasks and linked issues use exactly the missing pieces:

### Subtasks (`SubtasksSection`) — hardest
- **Inline rename:** externally-controlled edit mode (`isEditing` / `editValue` / `onEditChange` / `onSaveEdit` / `onCancelEdit`) rendering a plain `<input>`. `BoardRow` has its *own* rename (a pencil-triggered `<textarea>` via `onTitleChange`) with different ergonomics, so the two models must be reconciled.
- **`actionsSlot`:** per-row **Edit + Delete** hover buttons. `BoardRow` has no generic actions overlay (only the fixed `onDiscard` / `onMarkRead` single-button treatments).
- **`dragHandleSlot`:** subtask reorder, plus custom drag styling. Would re-point to `SortableBoardRow`.
- **`metadataSlot`:** an editable `AssigneePicker` avatar (maps to `BoardRow`'s built-in assignee).
- Data: `Subtask` (needs a `Subtask -> Ticket` adapter); has a static / pending variant too.

### Linked issues (`LinkedIssuesSection` -> `LinkedIssueRow`) — somewhat easier
- **`actionsSlot`:** an **unlink** action (passed from the parent). Same "BoardRow has no generic actions slot" gap as subtasks.
- **The relation:** each link carries a `relation` ("blocks" / "is blocked by" / "relates to", ...) that the parent manages and lets the PO change inline. There is no place for a relation label/editor in a `Ticket` or in `BoardRow`'s cluster, so it needs a new slot/prop or stays a host-level concern.
- **Lazy hover-data:** the row fetches the linked ticket's details on hover (`useLinkedTicketData`, `onMouseEnter`), falling back to a `boardTicket` snapshot. `BoardRow` builds its hover card from the `Ticket` it is given, so the host must pre-load or inject that data.
- Data: `LinkedIssue` (needs a `LinkedIssue -> Ticket` adapter); no inline rename, no reorder, so simpler than subtasks.

## The core decision (Phase 0)

The blocker both share is **`BoardRow` has no generic per-row action slot, and its inline rename differs from the subtask one.** To adopt `BoardRow` here, one of:

1. **Grow `BoardRow`** with an opt-in generic actions slot (a `rowActions?: ReactNode` overlay) and reconcile/extend inline edit. Lets everything share one row, but adds surface and regression risk to a perf-critical component used across the whole board.
2. **Keep `ChildIssueRow` for these two** and accept that "slotted" lists (actions + inline edit + relation) keep a thin slotted row, while board-shaped lists use `BoardRow`. Two row components by design, not by drift.
3. **Shared-surface fallback:** extract only the row-surface state machine (`rowSurfaceClasses(state, { accent })`) so `ChildIssueRow` stops drifting from `BoardRow` visually, without merging them. Keeps the slot flexibility, removes the visual drift, retires nothing.

Phase 0 must pick one, with the PO, **before** any migration code. Given how much `BoardRow` would have to grow, option 2 or 3 is a legitimate outcome here (it is fine for this story to conclude "don't fully merge these").

## Preconditions

- [ ] BRDG-367 merged (the `BoardRow` reuse pattern is in place).
- [ ] Clean working tree; commit each phase as its own logical unit.

## Phase 0: Investigation + decision (no production code)

- [ ] Inventory exactly what `SubtasksSection` and `LinkedIssuesSection` feed `ChildIssueRow` (slots, inline-edit wiring, relation handling, lazy hover-data, pending rows).
- [ ] Decide option 1 / 2 / 3 above with the PO. Capture in `docs/investigations/`.
- [ ] If option 2 or 3: this story becomes the shared-surface extraction (or a close-out), not a full migration.

## Phase 1 (only if option 1): grow `BoardRow`

- [ ] Add an opt-in generic actions overlay to `BoardRow` (e.g. `rowActions?: ReactNode`), inert for existing hosts, reusing the existing hover-fade overlay treatment.
- [ ] Reconcile inline rename so an externally-controlled edit mode is supported alongside the pencil trigger.
- [ ] Unit-test both additions; confirm no change for the board / inbox / Story Writer / epic / (BRDG-389) refinement + cleanup hosts.

## Phase 2 (option 1): migrate linked issues

- [ ] Add a `LinkedIssue -> Ticket` adapter; feed hover-data (pre-loaded or injected) so the on-hover card still works.
- [ ] Render `LinkedIssueRow` via `BoardRow` in a per-card `<table><tbody>`; wire the unlink action through the new actions overlay; keep the relation label/editor at the section level (or via a new slot).
- [ ] Remove `ChildIssueRow` from `LinkedIssueRow`; update tests; `verify` + `build` green; PO visual check.

## Phase 3 (option 1): migrate subtasks

- [ ] Add a `Subtask -> Ticket` adapter (incl. the pending/static variant).
- [ ] Render subtasks via `BoardRow` / `SortableBoardRow` (reorder), wiring Edit + Delete through the actions overlay and rename through the reconciled inline edit.
- [ ] Remove `ChildIssueRow` from `SubtasksSection`; update tests (reorder, rename, delete); `verify` + `build` green; PO visual + drag check.

## Acceptance Criteria

- [ ] A decision is recorded (full adoption vs keep-`ChildIssueRow` vs shared-surface).
- [ ] If full adoption: subtasks and linked issues render via `BoardRow`; `ChildIssueRow` is no longer imported by `SubtasksSection` or `LinkedIssueRow`; with it gone from all hosts, `ChildIssueRow.tsx` is deleted.
- [ ] Subtask reorder + rename + delete, and linked-issue unlink + relation change, behave as before.
- [ ] No regression on any other `BoardRow` host.
- [ ] `npm run verify` and `npm run build` pass.

## Out of scope

- The other row migrations: epic-children (BRDG-367, done), Compare view (BRDG-388), refinement + cleanup (BRDG-389). The inbox already uses `BoardRow`.
- Any change to subtask/linked-issue data models, link types, or the ticket-detail layout.

## Fallback

Option 3 above is the built-in fallback: extract the shared row-surface state machine and add a drift-guard test, keeping `ChildIssueRow`'s slots. This is the same fallback BRDG-367 / 388 / 389 define, and for these two hosts it may well be the recommended end state rather than a last resort.

## References

- [BRDG-367: Epic-children list adopts the shared BoardRow](completed/BRDG-367-epic-children-adopt-board-row.md) — the precedent.
- [BRDG-388: Compare view](BRDG-388-compare-view-adopt-board-row.md) · [BRDG-389: refinement + cleanup](BRDG-389-refinement-cleanup-adopt-board-row.md) — sibling migrations.
- [docs/investigations/2026-06-17-unified-issue-row.md](../investigations/2026-06-17-unified-issue-row.md) — original analysis (lists `ChildIssueRow`'s hosts and the slot model).
