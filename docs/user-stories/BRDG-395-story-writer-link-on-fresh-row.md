# BRDG-395: Story Writer link on a freshly inline-created row

**Status:** Done
**Priority:** Medium
**Type:** Feature (UX)

## Description

As a PO, when I create a story via the **inline quick-add** (the "Create story in this sprint…" bar), I want a small link to the **Story Writer** to appear on that new row as soon as it has a real VPL number, so I can jump straight into giving it content.

The link is **transient**: it shows from creation until I leave the view. It disappears on a real page reload or in-page navigation, but it must **not** disappear when a background/remote edit refetches the list. I do not want a permanent action on every row, and I do not want anything persisted.

## Scope

The inline quick-add is the `ChildIssueComposer` (`variant="bar"`) and it appears in three contexts, all of which must behave the same:

1. **Sprint board** — "Create story in this sprint…" ([src/components/sprint-board/TicketTable.tsx](../../src/components/sprint-board/TicketTable.tsx))
2. **Backlog** — "Create story in the backlog…" (same `TicketTable.tsx`)
3. **Epic page** — "Create issue in {group}…" / "Create unscheduled issue…" ([src/components/ticket-detail/EpicChildrenBySprint.tsx](../../src/components/ticket-detail/EpicChildrenBySprint.tsx))

Out of scope: the Story Writer Launcher modal (it already navigates straight into the writer), the detail-panel "Open story writer" link in `SidePanel.tsx` (stays as-is), and any always-on row action.

## Behaviour

- After an inline create resolves with a real VPL key, that row shows a small "Story Writer" link.
- The link does **not** appear on the optimistic `pending-…` placeholder row — only once the real key is in (the swap from `pending-…` to `VPL-…`). This is "nadat je een VPL nr hebt".
- The marker is **in-memory only** and view-scoped. It clears **only** on:
  - in-page navigation away from the view (component unmount), and
  - a real browser page reload (memory gone).
- It must **survive** background/remote refetches of the list (SWR revalidation, polling, an incoming remote edit). Holding the marker in view-level state achieves this for free — incoming data does not reset component state.
- No DB field, no timestamp, no storage. Nothing to persist; nothing for the row type to carry.

## Current state (where the pieces are)

- **Inline create handler (sprint/backlog):** `handleCreateTicket` in [src/components/sprint-board/SprintBoard.tsx](../../src/components/sprint-board/SprintBoard.tsx) (~lines 492-554). It optimistically inserts a placeholder row with `key: "pending-${…}"`, then on `ticketsApi.createTicket(...).then((created) => …)` swaps that row's key to `created.key`. **The `.then()` callback is where the fresh VPL key becomes known** — this is the capture point.
- **Create endpoint:** `POST /api/tickets` returns `{ key, title, type, jiraStatus, sprintId, epic, epicKey, assignee }` ([src/app/api/tickets/route.ts](../../src/app/api/tickets/route.ts)).
- **Inline create handler (epic page):** the epic context has its own `onCreateChild` path in [src/components/ticket-detail/EpicChildrenBySprint.tsx](../../src/components/ticket-detail/EpicChildrenBySprint.tsx) (~lines 764-780). Needs the same capture so the epic page behaves identically.
- **Row component:** [src/components/sprint-board/BoardRow.tsx](../../src/components/sprint-board/BoardRow.tsx) renders the row in **all** contexts (board, backlog, epic). The link goes next to the title.
- **Reusable link pattern:** [src/components/sprint-board/SidePanel.tsx](../../src/components/sprint-board/SidePanel.tsx) (~lines 423-436) already links to `/tickets/${key}/write` with a `NotebookPen` lucide icon in brand color. Reuse the URL + icon; render it as a small inline pill, not a menu item.

## Approach

1. **Track "freshly created this session" keys in memory.** Hold a `Set<string>` of VPL keys in **view-level React state** at the level that owns the list (the sprint board page for board/backlog; the equivalent owner for the epic-children view). When an inline create resolves, add `created.key`. Do **not** clear it on revalidation — view state already survives background refetches; it goes away on unmount (in-page navigation) and on reload. No persistence.
2. **Plumb a per-row flag to `BoardRow`.** Add an optional prop (e.g. `showStoryWriterLink?: boolean`) that the host sets true when `ticket.key` is in the freshly-created set. Keep `BoardRow`'s default behaviour unchanged when the prop is absent (all existing hosts stay identical).
3. **Render the link in `BoardRow`** next to the title: a small "nice" pill labelled **"Open in Story Writer"** with the `NotebookPen` icon (brand color), linking to `/tickets/${ticket.key}/write`. Only `transform`/`opacity` transitions, hover/focus-visible/active states, `cursor: pointer`.
4. **Wire all three contexts** so the marker is captured in board, backlog, and epic create flows, and the flag reaches the rows in each.

## Open questions

- None. Copy is **"Open in Story Writer"**; clear trigger is unmount (in-page nav) + reload only, not revalidation.

## Implementation Plan

> Produced by an Opus Plan agent against the current tree (2026-06-25). File/symbol-level reference.

**State owners (split):** board/backlog list state lives in `SprintBoard.tsx`; the epic-children list state lives in `EpicChildrenSection.tsx` (the `EpicChildrenBySprint` presenter does not own state). The "freshly created keys" `Set<string>` is held as plain component state in each owner — it survives SWR revalidation (no revalidation-keyed reset) and clears on unmount/reload.

**Visibility decision:** the pill is **always visible** on a flagged row (not hover-only), so the fresh marker is not missed. It still has hover/focus-visible/active states.

1. **`BoardRow.tsx` — add opt-in prop + pill (foundation).** Add `showStoryWriterLink?: boolean` to `BoardRowBaseProps` (default off, near `onMarkRead`); destructure `= false`. Render an `<a href={`/tickets/${ticket.key}/write`}>` "Open in Story Writer" pill next to the title (inside the title flex block ~599-628), guarded by `showStoryWriterLink`. Reuse `NotebookPen` (add to lucide import) + brand color `--color-brand-400`. `stopPropagation` on pointerDown/click so it doesn't trigger row select/drag. Transitions limited to `opacity,transform`; `cursor-pointer`; `active:scale-95`; `focus-visible` outline. `SortableBoardRow` spreads props, so no change there.
2. **`SprintBoard.tsx` — hold the Set.** `const [freshlyCreatedKeys, setFreshlyCreatedKeys] = useState<Set<string>>(() => new Set());`. No effect clears it.
3. **`SprintBoard.tsx` — capture on resolve.** In `handleCreateTicket`'s `.then((created) => {…})` add `created.key` to the Set after the existing reconcile + toast.
4. **`SprintBoard.tsx` — thread to `TicketTable`** via `freshlyCreatedKeys={freshlyCreatedKeys}`.
5. **`TicketTable.tsx` — apply.** Accept `freshlyCreatedKeys?: Set<string>`; in `makeRowProps` set `showStoryWriterLink: freshlyCreatedKeys?.has(ticket.key) ?? false`; add to the `useCallback` deps. Covers all four render paths + `SortableBoardRow`.
6. **`EpicChildrenSection.tsx` — hold the Set + capture.** Same `useState`; in `handleCreate`'s `.then((created) => {…})` add `created.key`. This single handler serves both epic view modes.
7. **Thread through both epic renderers.** Flat list `<BoardRow>` in `EpicChildrenSection.tsx`: `showStoryWriterLink={freshlyCreatedKeys.has(child.key)}`. By-sprint: pass `freshlyCreatedKeys` to `<EpicChildrenBySprint>`; there add the prop and set `showStoryWriterLink` in `renderRow`'s shared `rowProps` (covers both `SortableBoardRow` and `BoardRow` branches).
8. **Tests.** `BoardRow.test.tsx`: stub `NotebookPen`; assert link renders only when `showStoryWriterLink` and points at `/tickets/{key}/write`. `SprintBoard` test (new `SprintBoard.storyWriterMarker.test.tsx` or existing): marker appears after create resolves and **survives** a revalidation. `EpicChildrenSection.optimistic.test.tsx`: marker on resolve + survives refetch.

**Order:** 1 → 2,3,4 → 5 → 6,7 → 8.

**Risks:** epic view has two row renderers (both must be threaded); never clear the Set in a revalidation effect; pending `pending-…` rows never get the marker (added only on real `created.key`); `SortableBoardRow` covered via prop spread (regression-check the dnd path).

## Acceptance Criteria

- [x] Creating a story via the inline quick-add in a **sprint** shows a Story Writer link on the new row once it has a real VPL key. <!-- SprintBoard captures created.key in handleCreateTicket.then -> freshlyCreatedKeys -> TicketTable.makeRowProps -> BoardRow -->
- [x] Same behaviour in the **backlog** and on the **epic page**. <!-- backlog shares the SprintBoard/TicketTable path; epic via EpicChildrenSection.handleCreate -> both flat-list BoardRow and EpicChildrenBySprint.renderRow -->
- [x] The link does not show on the optimistic `pending-…` row, only after the real key arrives. <!-- key is added only in the create .then(), never for the pending placeholder -->
- [x] The link disappears on in-page navigation away and on a real page reload; it **survives** a background/remote refetch of the list; nothing is persisted. <!-- plain view-level useState Set; no revalidation-keyed reset -->
- [x] The pill reads "Open in Story Writer" and clicking it opens the Story Writer for that ticket (`/tickets/{key}/write`).
- [x] No always-on Story Writer action is added to existing rows; all current `BoardRow` hosts are visually unchanged when the new flag is absent. <!-- showStoryWriterLink defaults false; inert on all existing hosts -->
- [x] The pill has hover / focus-visible / active states and `cursor: pointer`; transitions limited to `transform`/`opacity`. <!-- transition-[opacity,transform]; active:scale-95; focus-visible outline; hover bg/text -->
- [x] Tests cover: marker added on create-resolve, marker **survives** a list revalidation, and `BoardRow` renders the link only when flagged. <!-- BoardRow.test.tsx (render-only-when-flagged), EpicChildrenSection.storyWriter.test.tsx (resolve + survives refetch), TicketTable.test.tsx (prop threading) -->
- [x] `npm run verify` and `npm run build` pass. <!-- verify: 6536 tests green; build: 164 pages, exit 0 -->

## References

- [Workspace Integration / Story Writer](../architecture/story-writer.md)
- [Optimistic Updates](../architecture/optimistic-updates.md) — the pending-edits / optimistic-insert overlay the create flow uses.
