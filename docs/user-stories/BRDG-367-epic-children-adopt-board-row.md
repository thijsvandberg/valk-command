# BRDG-367: Epic-children list adopts the shared BoardRow

**Status:** Not Started
**Priority:** Medium
**Type:** Refactoring

## Description

As a developer, I want the epic-children list on the ticket-detail page to render through the **shared** sprint-board row component (`BoardRow`) instead of its own `ChildIssueRow`, so that visual and behavioural parity with the board stops relying on hand-copying treatments across two files. The epic page keeps its own features; only the per-row rendering changes.

This is the implementation follow-up to the investigation in
[docs/investigations/2026-06-17-unified-issue-row.md](../investigations/2026-06-17-unified-issue-row.md). Read it first — it contains the comparison matrix, the data-shape adapter, the DnD findings, and the rationale for the phased approach.

## Goal

- The epic-children **flat list** (`EpicChildrenSection`) and the **by-sprint view** (`EpicChildrenBySprint`) render each child with `BoardRow` / `SortableBoardRow`.
- All epic-specific behaviour stays at the **section** level (status filter, field-visibility, inline create via `ChildIssueComposer`, link-existing search, AI suggestions, by-sprint grouping, bulk bar).
- `ChildIssueRow` is retired from both epic hosts.
- No visual identity with the board is required — the requirement is *shared component*, not pixel parity.

## Preconditions (MUST hold before starting)

This is a structural refactor of two large components (`EpicChildrenSection` ~1297 lines, `EpicChildrenBySprint` ~925 lines). To keep a clean rollback path:

- [ ] The working tree is fully committed (clean `git status`) before any code change in this story.
- [ ] No parallel sessions or background processes are touching these files or the shared row components during the work, so a revert is a single clean step.
- [ ] Each phase is committed as its own logical unit, so either phase can be reverted independently.

## PO confirmation gate

- [ ] **Phase 1 must be confirmed working by the PO (visual check of the epic page) before Phase 2 is started.** Do not begin the by-sprint DnD rework until the PO signs off on Phase 1.

## Phase 1: Flat list view (`EpicChildrenSection`, no DnD)

Lowest-risk first: this view has no drag-and-drop.

- [ ] Add an `epicChildToTicket(child)` adapter that produces a lightweight `Ticket` from an `EpicChild` (mirror the inbox's existing lightweight-ticket pattern). No API or schema change.
- [ ] Render `EpicChildrenSection` rows with `BoardRow` inside a per-card `<table className="w-full table-fixed border-collapse"><tbody>` block (the inbox reuse pattern).
- [ ] Add an optional open/total subtask-count chip prop to `BoardRow` (the one metadata bit `BoardRow` lacks today), inert on the board and its other hosts.
- [ ] Wire the existing row callbacks through `BoardRow`'s props: select, context menu, checkbox/multiselect, readiness, jira-status, SP/BV.
- [ ] Keep all section-level features working: status filter, field-visibility toggles, inline `ChildIssueComposer` create row, link-existing search, AI suggestions, bulk action bar.
- [ ] Remove `ChildIssueRow` usage from `EpicChildrenSection`.
- [ ] Tests: update `EpicChildrenSection.test.tsx`, `EpicChildrenSection.optimistic.test.tsx`, `EpicChildrenSection.plan-sprint.test.tsx`; add a test for `epicChildToTicket()`.
- [ ] `npm run verify` + `npm run build` green.
- [ ] PO visual check of the epic page (flat list).

## Phase 2: By-sprint view (`EpicChildrenBySprint`, cross-sprint DnD)

Only start after PO sign-off on Phase 1.

- [ ] Re-point the `SortableChildRow` wrapper at `SortableBoardRow`: feed drag state via `dragListeners` / `dragAttributes` / `rowStyle` instead of `dndProps` / `style` / `dragHandleSlot`.
- [ ] Preserve cross-sprint DnD exactly: the custom `epicChildrenCollisionDetection`, the `DroppableGroup` zones, the next-sprint create zone, and the backlog zones all stay at the section level.
- [ ] Align `PlaceholderRow`'s surface with the now-`BoardRow` rows so forward-planning placeholders still sit flush in the list.
- [ ] Render by-sprint rows with `BoardRow` in the same `<table><tbody>` per-card pattern as Phase 1.
- [ ] Remove `ChildIssueRow` usage from `EpicChildrenBySprint`.
- [ ] Tests: update `EpicChildrenBySprint`-related tests; cover reorder within a sprint and move across sprints.
- [ ] `npm run verify` + `npm run build` green.
- [ ] PO visual + drag check of the by-sprint view (reorder + cross-sprint move + placeholders).

## Acceptance Criteria

- [ ] Both epic-children views render rows via `BoardRow` / `SortableBoardRow`
- [ ] `ChildIssueRow` is no longer imported by `EpicChildrenSection` or `EpicChildrenBySprint`
- [ ] All section-level epic features still work (filter, field-visibility, create, link, AI, bulk, by-sprint grouping)
- [ ] Cross-sprint drag-and-drop in the by-sprint view behaves exactly as before
- [ ] No regression on the sprint board, Story Writer landing, or inbox (the other `BoardRow` hosts)
- [ ] `npm run verify` and `npm run build` pass
- [ ] Each phase committed independently; Phase 2 only started after PO sign-off on Phase 1

## Out of scope

- Migrating `ChildIssueRow`'s other hosts (subtasks, linked issues, refinement list, cleanup page)
- Making the epic list *visually identical* to the board (goal is shared component, not pixel parity)
- Changing the data model, API routes, or any shared primitive (`TicketStatusPill`, pickers, etc.)
- The Compare view's legacy `TicketRow` (being phased out separately)

## Fallback

If Phase 2's DnD rework proves too invasive, fall back to extracting only the shared row-surface state machine (`rowSurfaceClasses(state, { accent })`) used by both `BoardRow` and `ChildIssueRow`, plus a drift-guard test. This removes the styling drift without the structural rework. See the investigation doc for details.
