# BRDG-374: Extract a reusable row-actions module (menu + bulk bar + dispatch)

**Status:** Not Started
**Priority:** Medium
**Type:** Refactor — Sprint board / shared components

## Description

The ticket row-actions surface (right-click menu + multi-select bulk bar + their dispatch
handlers) is **partly shared and partly copy-pasted**. The presentation components and the
dispatch hook already exist as reusable pieces, but the **orchestration that glues them
together** lives inline in `SprintBoard` and is duplicated in `EpicChildrenSection`. Adding the
same surface to a third place (the inbox, [[BRDG-373-inbox-row-context-menu-and-bulk-actions]])
means copying that glue a third time and fighting a data-shape mismatch.

This story extracts the whole surface into a **drop-in module** so any list of tickets gets the
full menu + bulk bar by supplying only: its data source, its selection set, and `showToast`.
This is the enabler that makes BRDG-373 (and future surfaces) trivial.

## Current Behaviour — what is and isn't shared

**Already reusable:**

- Presentation: `TicketActionMenuContent`, `CursorMenu`, `AnchoredMenu`, `MenuItem`
  ([ticket-action-menu.tsx](../../src/components/sprint-board/ticket-action-menu.tsx)) and
  [`BulkActionBar`](../../src/components/sprint-board/BulkActionBar.tsx).
- Dispatch: [`useTicketActions`](../../src/components/sprint-board/useTicketActions.ts) — per-row
  and bulk handlers with optimistic edits via `pendingTicketEdits` / `pendingSprintMoves`.
- Pure logic: [`computeQuickMoves`](../../src/lib/quick-moves.ts), `sprint-placement` helpers.

**Not shared — duplicated glue (in `SprintBoard`, mirrored in `EpicChildrenSection`):**

- `rowMenu: { x, y, targets }` state + `handleRowContextMenu` (cursor position, target = single
  row vs. current selection) + the `<CursorMenu><TicketActionMenuContent/></CursorMenu>` render.
- `quickMovesFor(targets)` + `handleQuickMove` + the `CreateSprintModal` auto-create flow.
- `computeFlagState`, `openRefine` + the refine modal, `handleBulkReviewStory`,
  `handleBulkGenerateSubtasks` (orchestration, busy state, and toasts not in `useTicketActions`).
- The `<BulkActionBar ...>` prop-mapping block (~20 props).
- The data fetches the surface needs: `useJiraSprints`, `useBacklogDropTarget`.

**The data-shape mismatch:** `useTicketActions` is typed to `apiTickets: Ticket[]` +
`mutateTickets: KeyedMutator<Ticket[]>` and optimistically patches that exact cache. The inbox's
cache is `NewStoriesResponse` (`{ rows: NewStoryRow[] }`), so the hook can't be dropped on it
without an adapter. Generalising this contract is the core of the refactor.

## Proposed Approach

Introduce a single composition layer that owns the glue and depends only on a small,
surface-agnostic adapter.

1. **`useRowActions(...)` hook** — wraps `useTicketActions` and additionally owns: `rowMenu`
   state + `handleRowContextMenu`, `quickMovesFor` + `handleQuickMove` + create-sprint signalling,
   `computeFlagState`, and the review/subtasks/refine orchestration. Returns ready-made props for
   the menu and the bulk bar plus the modal signals the host renders.
2. **Generalise the data contract.** Replace the hard `Ticket[]` / `KeyedMutator<Ticket[]>`
   dependency with a thin adapter: `getTicket(key) → Ticket`, `patch(key, partial)` (optimistic),
   and `mutate()` (revalidate). The board passes its `Ticket[]` cache; the inbox passes a
   `NewStoryRow`-backed adapter. Optimistic mechanics (`pendingTicketEdits`/`pendingSprintMoves`)
   stay intact.
3. **Thin wrapper components** — `<RowContextMenu surface={...} />` and `<RowBulkBar surface={...} />`
   so a host renders two components instead of re-deriving ~20 props. The host still owns row
   rendering (`BoardRow`), selection state, and modal mounting.
4. **Migrate all three call sites** onto the module: `SprintBoard`, `EpicChildrenSection`, and
   the inbox (the inbox migration is delivered by BRDG-373). Net result: one source of truth,
   no behavioural change on the board or epic page.
5. **Keep `SprintBoard` slimmer.** This continues the god-component decomposition direction
   (cf. BRDG-202a) by lifting the row-actions glue out of the page component.

## Acceptance Criteria

- [ ] A new surface gets the full right-click menu + bulk bar by supplying only a data adapter,
      a selection set, and `showToast` — no copied glue.
- [ ] `useTicketActions`' data dependency is generalised so a non-`Ticket[]` cache (the inbox's
      `NewStoriesResponse`) works without forking the hook.
- [ ] `rowMenu` state, `quickMovesFor`/`handleQuickMove`, flag-state, and review/subtasks/refine
      orchestration live in the shared module, not inline in `SprintBoard`.
- [ ] `SprintBoard` and `EpicChildrenSection` are migrated to the module with **no behavioural
      change** (same menu items, same bulk actions, same optimistic updates, same toasts).
- [ ] Optimistic-update mechanics (`pendingTicketEdits` / `pendingSprintMoves`) are preserved
      exactly; [optimistic-updates.md](../architecture/optimistic-updates.md) is updated to
      describe the shared module.
- [ ] No regression in board/epic context-menu, bulk-bar, quick-move, or auto-create behaviour.

## Tests

- [ ] The module renders the menu/bulk bar from a minimal adapter and dispatches the right
      API calls for each action.
- [ ] Board and epic regression: existing context-menu / bulk-bar / quick-move tests pass
      unchanged after migration.
- [ ] The generalised adapter applies optimistic patches and reverts on failure for both a
      `Ticket[]` source and a row-list source.
- [ ] Quick-move computation + auto-create signalling work through the shared module.

## Open Questions

- **Scope of extraction.** Minimal (just lift the inline glue) vs. fuller (also fold the modal
  state — create-sprint, refine — into the module via host-rendered slots). Recommend: lift the
  glue + adapter now; keep modal mounting in the host to avoid portal/ownership churn.
- **Adapter vs. union type.** A small adapter object (recommended) vs. widening `useTicketActions`
  to accept a discriminated union of cache shapes. Adapter keeps the hook unaware of cache
  internals.
- **Sequencing.** Recommended to land this before
  [[BRDG-373-inbox-row-context-menu-and-bulk-actions]] so the inbox is a clean consumer; if the
  PO wants the inbox value sooner, 373 ships with a local adapter and this story collapses it.

## Related

- [[BRDG-373-inbox-row-context-menu-and-bulk-actions]] — the first consumer of this module.
- [[BRDG-369-move-to-next-sprint-quick-action]] — quick-move logic folded into the module.
- [[BRDG-367-epic-children-adopt-board-row]] / `EpicChildrenSection` — the second call site to migrate.
- Touch points: `useTicketActions`, `ticket-action-menu.tsx`, `BulkActionBar.tsx`,
  `quick-moves.ts`, `pendingTicketEdits`, `pendingSprintMoves`.
