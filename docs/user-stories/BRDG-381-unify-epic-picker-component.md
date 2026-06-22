# BRDG-381: One epic picker for sidebar + row/bulk menus (real reuse, not a lookalike)

**Status:** Not Started
**Priority:** Medium
**Type:** Refactor — shared components / Sprint board

## Description

The board now has **two epic pickers that only look alike**:

- [`EpicPicker`](../../src/components/shared/EpicPicker.tsx) — the rich sidebar / board-row
  picker (search, AI suggest, stale-summary footer, View/Unlink actions, selected checkmark),
  built on `BasePicker` (its own trigger + portal popover + context).
- [`EpicListPanel`](../../src/components/shared/EpicListPanel.tsx) — a **hand-built copy** that
  renders inside the right-click / bulk-action menu card (added in commit `59687667`).

Because the menu version is a reimplementation, every detail has to be re-matched by hand and
they keep drifting: "No epic" vs. "Unlink", the selected-state action row (View/Unlink), the
selected checkmark, the AI-suggest sparkle, the Back row. The PO has flagged this directly:
*"aangezien er zoveel verschillen zijn ... kunnen we dit niet beter echt zo bedraden dat het
dezelfde componenten zijn. Nu is het nabouwen."*

This story makes both surfaces render the **same component**, so they are identical by
construction and there is one place to change.

## Current Behaviour — why they can't share today

`EpicPicker` couples three things in one component:

1. **Container** — `BasePicker.Root` provides a trigger pill + a portal popover positioned with
   floating-ui, plus context (`query`, `setQuery`, `searchRef`, `handleClose`).
2. **Body** — the search row, AI-suggest flow (`useTaskStream`), suggestions, the View/Unlink
   action row (driven by `value`), the epic list (checkmark + stale icon + key link), stale footer.
3. **Data** — `useSWR("/api/epics")`, Jira sync, suggest endpoint.

The menu surfaces (`CursorMenu` / `AnchoredMenu`) are a **different container**: a multi-level
menu card with its own open/close, not a `BasePicker` popover. So only the *container* legitimately
differs; the *body* should be shared but currently is duplicated in `EpicListPanel`.

## Proposed Approach

Extract the popover **body** into a container-agnostic component used by both surfaces.

1. **New `EpicPickerBody`** (`src/components/shared/EpicPickerBody.tsx`) — presentational, no
   `BasePicker` dependency. Owns its own `query` state, search input (autofocus), `useSWR` epics,
   sync, and the AI-suggest hook. Renders: search row (search + AI sparkle + sync), suggest
   loading/error/results, the **View / Unlink action row when `value` is set**, and the epic list
   (selected checkmark, stale icon, key link), plus the stale-summary footer.
   Props: `{ value: EpicOption | null, onChange: (epic | null) => void, onClose: () => void,
   ticketKey?: string, onViewInSidebar?: () => void }`.
2. **`EpicPicker` becomes a thin wrapper** — `BasePicker.Root` + the trigger pill +
   `<BasePicker.Popover><EpicPickerBody .../></BasePicker.Popover>`. All body logic moves out; the
   14 existing `EpicPicker` tests are the regression net and must pass unchanged.
3. **The menu renders `EpicPickerBody` directly** in its "Set Epic" sub-view (inside the menu
   card), passing the right-clicked row's current epic as `value` and the single target key as
   `ticketKey`. This deletes the bespoke list, the default "No epic" row, and the **Back** row for
   the epic panel — the body's own search sits at the top, exactly like the sidebar.
4. **Provide the current epic to the menu.** The right-click handlers know only `targets`; for a
   single target, look up the row's `{ epic, epicKey }` and pass it as `value` so the menu shows
   the checkmark + View/Unlink, identical to the sidebar.
5. **Remove `EpicListPanel`** (move to `deleted/`), keeping the already-landed fixes from
   `59687667`: the `handleBulkSetEpic` optimistic overlay (epic + epicKey) and the auto-sync.

## Implementation Plan

Extract the body, make `EpicPicker` a thin wrapper, render the body in the menu, thread `value`.

**Key insight:** `EpicPickerBody` must own its own `query` state + search input (autofocus) so it no
longer reads `BasePicker.useContext()` (that context only exists inside `BasePicker.Root`). The
wrapper passes `handleClose` as `onClose`. `BasePicker.Popover` returns null when closed, so the
body remounts per open → mount-based auto-sync (matches the removed `EpicListPanel`). Verified:
`BasePicker.List/Item/Empty` do NOT use context, so the list markup stays byte-identical (keeps the
14 EpicPicker tests' selectors valid).

**Body prop contract:** `{ value: EpicOption|null, onChange: (epic|null)=>void, onClose: ()=>void,
ticketKey?: string, onViewInSidebar?: ()=>void, onRemove?: ()=>void }`. `onRemove` (bulk only)
renders a single "Remove epic" action when `value` is null. View/Unlink row renders only when
`value` is set. No "No epic" row ever.

**Menu adapter:** `subView === "epic"` renders `EpicPickerBody` (no Back row) with
`onChange={(epic) => { onSetEpic?.(epic?.key ?? null, epic?.name ?? null); close(); }}`. New
`TicketActionMenuContent` props: `epicValue?`, `onRemoveEpic?` (existing `epicSuggestTicketKey?` →
`ticketKey`). Single-row right-click passes the row's current epic as `epicValue` + the key as
`ticketKey`; multi passes `epicValue=null` + `onRemoveEpic`. `BulkActionBar`/`UpdateDropdown`
forward `onRemoveEpic`.

**Steps (each compiles + tests pass before the next):**
1. Extract `EpicPickerBody` + rewrite `EpicPicker` as wrapper (in `EpicPicker.tsx`). Add
   `EpicPickerBody.test.tsx`. 14 EpicPicker tests pass unchanged. → AC1 (sidebar), AC6
2. Wire `EpicPickerBody` into `ticket-action-menu.tsx`; drop Back row for epic; add `epicValue`;
   remove `EpicListPanel` import. Add no-Back-row test. → AC1 (menu), AC3, AC4
3. Add `onRemove` to body + menu "Remove epic" (bulk). → AC2 (bulk)
4. Thread `epicValue`/`onRemoveEpic` from `SprintBoard`, `EpicChildrenSection`, inbox; forward via
   `BulkActionBar`/`UpdateDropdown`. Look the epic up from `displayTickets`/row data (overlay-aware
   so the chip + checkmark stay consistent → AC5). → AC2 (single), AC5
5. `git mv` `EpicListPanel.tsx` + `.test.tsx` to `deleted/` (house rule: never hard-delete);
   `grep` confirms no refs. Must be last so nothing imports it mid-refactor. → AC7
6. Final: `npm run verify` + `npm run build`.

**Risks:** query leaving BasePicker context (mitigate: wrapper keeps Root/Trigger/Popover, only the
body's input/query move local; List/Item don't use context); autofocus (add `autoFocus`);
`open`-gated effects become mount/unmount; "View epic"/row-key links + stale icon moved verbatim;
menu callers passing only `(epicKey)` are fine (extra name arg ignored); keep the rich
`EpicListItem` SWR type (don't simplify) so stale-icon/footer + tests stay valid.

## Acceptance Criteria

- [ ] Sidebar/board-row picker and the row/bulk-menu picker render the **same** `EpicPickerBody`;
      no second implementation of the search/list/suggest/actions markup exists.
- [ ] No default **"No epic"** row. When the (single) target already has an epic, the body shows
      the **Unlink** action (and View), matching the sidebar; the selected epic shows its checkmark.
- [ ] **AI suggest** (sparkle) appears for a single-row right-click and is hidden for multi-select.
- [ ] The epic panel in the right-click / bulk menu has **no Back row**.
- [ ] Setting/unlinking an epic from the menu still updates the board chip instantly (optimistic
      overlay preserved) and a newly created epic still appears via auto-sync / refresh.
- [x] The 14 existing `EpicPicker` tests pass unchanged; sidebar behaviour (trigger, View-in-sidebar
      vs. link, row key links, stale indicator) is unchanged.
- [ ] `EpicListPanel` is removed (moved to `deleted/`); no references remain.

## Tests

- [ ] `EpicPickerBody`: renders list + keys, filters by query, selects (key + name), shows
      checkmark for `value`, shows View/Unlink only when `value` set, fires AI suggest when
      `ticketKey` given and hides it otherwise.
- [ ] `EpicPicker` regression suite passes after the wrapper refactor.
- [ ] Menu integration: single-row right-click shows checkmark + Unlink + sparkle; multi-select
      shows neither sparkle nor a pre-selected check.
- [ ] `handleBulkSetEpic` optimistic-overlay tests still pass.

## Decisions

- **Bulk clear (resolved).** Multi-select shows a single **"Remove epic"** action (no default
  "No epic" list row); the single-row case stays byte-identical to the sidebar. **AI suggest is
  not shown for bulk** — it's single-ticket only.

## Open Questions

- **Sync cadence.** Sidebar auto-syncs once per session; a remount-per-open body would sync once
  per open. Recommend per-open (fresher, negligible cost) unless the PO prefers the old cadence.
- **Stale-summary footer in the menu.** Include it for true sameness (recommended) or hide it as
  epic-maintenance noise in a quick set-epic flow.
- **`EpicListPanel` tests** (`EpicListPanel.test.tsx`) are superseded; fold their assertions into
  the `EpicPickerBody` tests.

## Related

- Commit `59687667` — added `EpicListPanel` (the lookalike) + the bulk-epic optimistic fix this
  story builds on.
- [[BRDG-374-extract-shared-row-actions-module]] — adjacent (menu/bulk-bar *orchestration* glue),
  not the picker component itself; both touch `ticket-action-menu.tsx`.
- [optimistic-updates.md](../architecture/optimistic-updates.md) — the overlay the menu path uses.
- Touch points: `EpicPicker.tsx`, `EpicListPanel.tsx` (removed), `BasePicker.tsx`,
  `ticket-action-menu.tsx`, `SprintBoard.tsx`, `EpicChildrenSection.tsx`, inbox `page.tsx`.
```
