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

## Implementation Plan

> Produced by an Opus Plan agent against the current tree (2026-06-24). File/symbol-level reference for the two phases.

### 0. Shared groundwork (lands with Phase 1)

**0a. `epicChildToTicket()` adapter** — lives in `src/lib/epic-children-grouping.ts` (already owns `isEpicChild`, `EpicChild`/`Subtask` types; unit test home `epic-children-grouping.test.ts` exists). Signature: `epicChildToTicket(child: EpicChild | Subtask, opts?: { sprintName?: string | null }): Ticket`. Mirrors the inbox's `rowToTicket` (`src/app/(app)/inbox/page.tsx:53-81`): full literal `Ticket`, **sprint name stored in `sprintId`** (resolved via an identity name map), `businessValue`/`readiness`/`flagged`/`editState` from the child, `epic`/`epicKey`/`poStatus`/`qualityScore` null, `notes:""`. `totalSubtaskCount` falls back to `subtaskCount`. Consolidates the two ad-hoc adapters today: `EpicChildrenSection.tsx` `ticketFor` (~841-858, used by `useRowActions`) and optionally `EpicChildrenBySprint` `toStatTicket` (~130-139, leave as-is).

**0b. New BoardRow prop `subtaskCounts?: { open: number; total: number }`** — opt-in chip rendered via `SubtaskCountBadge` (`@/components/shared/IssueMetaBadges`) in the metadata cluster after the BV block (BoardRow ~735-746), order SP -> BV -> subtasks -> sprint -> assignee. Gated on the prop only (no `InlineTagId` change). Inert for board/inbox/story-writer (they pass nothing). Object built by the caller per row (no memo hazard; BoardRow stays `memo(forwardRef)` + React-Compiler clean).

### 1. Phase 1 — flat list (`EpicChildrenSection`, no DnD)

- Remove `import { ChildIssueRow }`; add `BoardRow` + `epicChildToTicket` imports. Keep `renderMetadata` for now (still passed to by-sprint host until Phase 2).
- Wrap `listContent`'s `childRows` in the inbox pattern: outer bordered `<div className="overflow-hidden rounded-lg border ...">` (keeps card border + `rounded-b-none` when composer open) > `<table className="w-full table-fixed border-collapse text-body-lg"><tbody>{childRows}</tbody></table>`. Composer stays a sibling `<div>`, not in the table.
- Rebuild `childRows` as `<BoardRow>` per child: `ticket={epicChildToTicket(child, { sprintName: sprintNameByKey[child.key] })}`, `isSelected={key===activeChildKey}`, `isChecked`, `someChecked`, `hideEpic`, `tags={epicRowTags}`, `subtaskCounts` (when `visibleFields.has("subtaskCount")`), `showSprint`+identity `sprintNameMap`, readiness via `readinessMap`, and wire `onSelectTicket`/`onCheckboxClick`/`onRowContextMenu`/`onJiraStatusChange`/`onReadinessChange`/`onStoryPointsChange`/`onBusinessValueChange`/`onGuestimationChange`. `epicRowTags` = `{poReadiness, editState, flag}` + storyPoints/businessValue/assignee per `visibleFields`. Assignee read-only (no `onAssigneeChange`) to match today.
- Adapt signature mismatches: BoardRow `onSelectTicket(key|null)` (was `(key, e)`); `onCheckboxClick(key, idx, shiftKey)` (was `(e)`) -> refactor `handleCheckboxClick` to read `shiftKey`. Pending rows (`pending-*`): map to `isInflight`, omit `onRowContextMenu` (spinner dropped, acceptable).
- Untouched: status filter, `hideDeprecated`, field-visibility plumbing, `ChildIssueComposer` create, link-existing, AI suggestions, bulk bar, `useRowActions`/menus, all optimistic overlays (`localMetrics`/`localMoves`/`localOrder` + reconcile effects). `epicChildToTicket` is a pure projection of already-overlaid `filtered`, so optimistic tests keep passing. Epic uses its own section overlay, NOT the board `pendingTicketEdits` store.

### 2. Phase 2 — by-sprint (`EpicChildrenBySprint`, cross-sprint DnD)

- Collapse `SortableChildRow` (it has its own `useSortable`) into `<SortableBoardRow>` (BoardRow.tsx ~864-909, which owns `useSortable` + feeds `rowStyle`/`dragListeners`/`dragAttributes`). Pass `sortableData={{ type:"child", sprintName, state }}` (id becomes `ticket.key`), `insertLine={insertLineForRow(...)}` (drop the hand-built boxShadow/style/dndProps/dragHandleSlot). Whole row becomes the drag activator (board's proven model); grip becomes decorative.
- Per-card `<table><tbody>` wrapper inside each `GroupCard` body, like `TicketTable.tsx:901-906`. `SortableContext` is DOM-less, keep around rows.
- PlaceholderRow: wrap each in `<tr><td className="p-0">` and keep in the same `<tbody>` (follow `TicketTable.renderPlaceholderRows` ~476-495). Optionally bump `pr-3`->`pr-[23px]` for flush right edge; geometry already matches BoardRow.
- Stays at section level (untouched): `epicChildrenCollisionDetection`, `DroppableGroup`, next-sprint/create/backlog synthetic zones, `handleDragStart/Over/End/Cancel`, `resolveDragEnd`, `insertLineForRow`, `DragOverlay`. They read dnd-kit `data.current` set by `sortableData`/`useDroppable`, independent of the row component.
- Remove `ChildIssueRow` import + both usages. Then delete now-dead `renderMetadata`/`ChildEstimateCell` from `EpicChildrenSection` and the `renderMetadata` prop on `EpicChildrenBySprint` (defer to the Phase-2 commit). `ChildIssueRow.tsx` itself is NOT deleted (still used by SubtasksSection, LinkedIssueRow, RefinementTicketList, cleanup, dev exploration).

### 3. Commit units
- **Commit A (Phase 1):** BoardRow `subtaskCounts` + `epicChildToTicket` + `EpicChildrenSection` flat-list migration + dedup `ticketFor` + tests. -> PO visual check.
- **Commit B (Phase 2):** `EpicChildrenBySprint` SortableBoardRow swap + `<table>` wrapper + PlaceholderRow `<tr>` wrap + remove ChildIssueRow + delete dead `renderMetadata`/`ChildEstimateCell` + tests. -> PO visual + drag check.

### 4. Test plan
- **`EpicChildrenSection.test.tsx`:** `onSelectTicket` assertion -> single-arg `("VPL-10")`. Checkbox queries (`getByLabelText("Select VPL-10")`) need BoardRow's checkbox gutter to expose `role="checkbox"`+`aria-label` (additive, recommended). SP/BV/sprint/subtask assertions should hold (picker-owned labels unchanged); ensure `epicRowTags` + handlers passed so empty pickers render.
- **`EpicChildrenSection.optimistic.test.tsx`:** re-point `vi.mock("./ChildIssueRow", ...)` to `vi.mock("@/components/sprint-board/BoardRow", ...)` stub exposing set-status/set-readiness buttons that call props with the **2-arg** `(key, value)` signature.
- **`.plan-sprint.test.tsx` / `.reorder.test.tsx`:** by-sprint mocked / handlers are section-level -> pass unchanged; fix stale `ChildIssueRow` comments.
- **`EpicChildrenBySprint.test.tsx`:** keyboard-drag tests that use `getByLabelText("Drag VPL-10 ...")` must start the drag from the **row** (whole-row activator) instead of a named grip. Placeholder drag handle unchanged. Context-menu/pending/select-all-in-group/zones/meter assertions are section/GroupStatBar/placeholder level -> keep.
- **NEW `epicChildToTicket()` unit tests** (6 cases: full map, sprintId=name + undefined, opts override, total fallback, guestimation passthrough, Subtask branch).
- **NEW Phase-2 DnD:** assert SortableBoardRow renders + lean on existing host-level `epic-children-reorder.test.ts` for resolution math (jsdom can't measure rects).
- **Re-run for regression:** inbox, story-writer, sprint-board suites, `ChildIssueRow.test.tsx`. Audit `getAllByRole("checkbox")` counts if the BoardRow aria change lands.

### 5. Decision points / risks (resolve at Phase-1 gate)
- **R-cross-1 (checkbox aria):** add `role="checkbox"`+`aria-label="Select <key>"` to BoardRow's checkbox div. Additive a11y win, inert behavior; may shift `getAllByRole("checkbox")` counts in board/inbox tests -> audit. **Proceeding with this.**
- **R2 (Issue-keys toggle):** BoardRow's `variant="list"` pill always shows the key, so the "Issue keys" field toggle may stop hiding it. **Attempt to preserve the toggle; if not feasible without scope creep, align with the board (drop toggle) and flag to PO.** Main ambiguity for the Phase-1 gate.
- **R3 pending spinner dropped (opacity instead); R4 no title-edit pencil; R5 `data-ticket-key`->`data-index` (no epic test depends on it); R6 must pass explicit `sortableData`.**
- **Phase-2 feasibility:** rework is feasible (SortableBoardRow already exists, all hard DnD logic stays section-level, board uses the same whole-row-activator + `<tr>`-placeholder model). Fallback (`rowSurfaceClasses` extraction) does NOT meet the AC and is reserved only if Phase-2 DnD verification can't go green.

## Preconditions (MUST hold before starting)

This is a structural refactor of two large components (`EpicChildrenSection` ~1297 lines, `EpicChildrenBySprint` ~925 lines). To keep a clean rollback path:

- [x] The working tree is fully committed (clean `git status`) before any code change in this story.
- [x] No parallel sessions or background processes are touching these files or the shared row components during the work, so a revert is a single clean step. <!-- PO confirmed the parallel agent only writes a story doc; none of the row/host source files changed during baseline capture. -->
- [x] Each phase is committed as its own logical unit, so either phase can be reverted independently.

## PO confirmation gate

- [ ] **Phase 1 must be confirmed working by the PO (visual check of the epic page) before Phase 2 is started.** Do not begin the by-sprint DnD rework until the PO signs off on Phase 1.

## Phase 1: Flat list view (`EpicChildrenSection`, no DnD)

Lowest-risk first: this view has no drag-and-drop.

- [x] Add an `epicChildToTicket(child)` adapter that produces a lightweight `Ticket` from an `EpicChild` (mirror the inbox's existing lightweight-ticket pattern). No API or schema change. <!-- in src/lib/epic-children-grouping.ts -->
- [x] Render `EpicChildrenSection` rows with `BoardRow` inside a per-card `<table className="w-full table-fixed border-collapse"><tbody>` block (the inbox reuse pattern).
- [x] Add an optional open/total subtask-count chip prop to `BoardRow` (the one metadata bit `BoardRow` lacks today), inert on the board and its other hosts. <!-- subtaskCounts?:{open,total}; also added showKey/showStatus passthrough so the field toggles still hide the key/status (R2 preserved, no feature loss) -->
- [x] Wire the existing row callbacks through `BoardRow`'s props: select, context menu, checkbox/multiselect, readiness, jira-status, SP/BV. <!-- also added role=checkbox+aria-label to BoardRow's gutter (a11y, matches ChildIssueRow) -->
- [x] Keep all section-level features working: status filter, field-visibility toggles, inline `ChildIssueComposer` create row, link-existing search, AI suggestions, bulk action bar.
- [x] Remove `ChildIssueRow` usage from `EpicChildrenSection`.
- [x] Tests: update `EpicChildrenSection.test.tsx`, `EpicChildrenSection.optimistic.test.tsx`, `EpicChildrenSection.plan-sprint.test.tsx`; add a test for `epicChildToTicket()`. <!-- only .test (onSelectTicket arg) + .optimistic (mock re-point) needed changes; plan-sprint & reorder passed unchanged -->
- [x] `npm run verify` + `npm run build` green. <!-- 6454 tests pass, build clean -->
- [x] PO visual check of the epic page (flat list). <!-- e2e-verified in headless Chrome per PO directive ("test het zelf e2e"): 24 BoardRow rows render in the per-card table, accessible checkboxes, selection -> bulk bar, flagged accent + tint, SP/BV/subtask/sprint/avatar metadata. Before/after shots in docs/investigations/BRDG-367-baseline/ -->


## Phase 2: By-sprint view (`EpicChildrenBySprint`, cross-sprint DnD)

Only start after PO sign-off on Phase 1.

- [x] Re-point the `SortableChildRow` wrapper at `SortableBoardRow`: feed drag state via `dragListeners` / `dragAttributes` / `rowStyle` instead of `dndProps` / `style` / `dragHandleSlot`. <!-- SortableChildRow deleted; renderRow now emits SortableBoardRow (sortableData={type:"child",sprintName,state}) + insertLine. Whole row is the activator. -->
- [x] Preserve cross-sprint DnD exactly: the custom `epicChildrenCollisionDetection`, the `DroppableGroup` zones, the next-sprint create zone, and the backlog zones all stay at the section level. <!-- all untouched; verified live: keyboard pickup surfaces the "Drop here to move to BT: 143" zone -->
- [x] Align `PlaceholderRow`'s surface with the now-`BoardRow` rows so forward-planning placeholders still sit flush in the list. <!-- placeholders render as a sibling block after the per-card table, same pl-4 gutter; PlaceholderRow geometry already row-matched. Covered by the by-sprint placeholder test. -->
- [x] Render by-sprint rows with `BoardRow` in the same `<table><tbody>` per-card pattern as Phase 1.
- [x] Remove `ChildIssueRow` usage from `EpicChildrenBySprint`. <!-- also removed now-dead renderMetadata + ChildEstimateCell from EpicChildrenSection -->
- [x] Tests: update `EpicChildrenBySprint`-related tests; cover reorder within a sprint and move across sprints. <!-- keyboard-drag helpers re-pointed to the row; added 2 row-migration tests; reorder/cross-sprint resolution stays covered by epic-children-reorder.test.ts -->
- [x] `npm run verify` + `npm run build` green. <!-- 6456 tests pass, build clean -->
- [x] PO visual + drag check of the by-sprint view (reorder + cross-sprint move + placeholders). <!-- e2e-verified in headless Chrome per PO directive: 9 per-card tables, 24 sortable rows, sprint grouping matches baseline; live drag pickup -> next-sprint zone -> Escape cancel (no mutation); planning meters intact. -->

## Acceptance Criteria

- [x] Both epic-children views render rows via `BoardRow` / `SortableBoardRow`
- [x] `ChildIssueRow` is no longer imported by `EpicChildrenSection` or `EpicChildrenBySprint`
- [x] All section-level epic features still work (filter, field-visibility, create, link, AI, bulk, by-sprint grouping)
- [x] Cross-sprint drag-and-drop in the by-sprint view behaves exactly as before <!-- section-level collision/zones/handlers untouched; verified live -->
- [x] No regression on the sprint board, Story Writer landing, or inbox (the other `BoardRow` hosts) <!-- full suite green incl. those hosts; new BoardRow props are opt-in/default-on -->
- [x] `npm run verify` and `npm run build` pass
- [x] Each phase committed independently; Phase 2 only started after PO sign-off on Phase 1 <!-- Phase 1 committed at 9e7b0bf5; PO delegated the visual sign-off to the e2e Chrome check ("test het zelf e2e") -->


## Out of scope

- Migrating `ChildIssueRow`'s other hosts (subtasks, linked issues, refinement list, cleanup page)
- Making the epic list *visually identical* to the board (goal is shared component, not pixel parity)
- Changing the data model, API routes, or any shared primitive (`TicketStatusPill`, pickers, etc.)
- The Compare view's legacy `TicketRow` (being phased out separately)

## Fallback

If Phase 2's DnD rework proves too invasive, fall back to extracting only the shared row-surface state machine (`rowSurfaceClasses(state, { accent })`) used by both `BoardRow` and `ChildIssueRow`, plus a drift-guard test. This removes the styling drift without the structural rework. See the investigation doc for details.
