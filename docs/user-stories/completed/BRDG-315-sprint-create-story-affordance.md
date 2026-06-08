# BRDG-315: Single-sprint create-story affordance (+ button, composer alignment, draft key)

**Status:** To Do
**Priority:** Medium
**Type:** Improvement
**Related:** ChildIssueComposer.tsx, TicketTable.tsx, GroupStatBar.tsx, SprintBoard.tsx, BoardRow.tsx (the "All" / grouped view already has the + pattern via `createAction`)

## Description

On the **single-sprint** sprint backlog, creating a story is rough around the edges:

1. The `Create story in this sprint...` composer is **always visible** at the bottom of the
   list. The PO wants it hidden behind a **`+` button in the sprint header** instead, exactly
   like the **All / grouped page** already works (the `+` next to the `...` menu toggles the
   composer per sprint group).
2. The composer should **stay open and refocus the input after Enter**, so several stories can
   be typed in a row without re-opening it each time.
3. The composer's **issue-type icon + title-input position** does not line up cleanly with the
   ticket rows above it (see screenshots). The input title and the icon need a tidier alignment.
4. While a story is being created, the optimistic row shows the raw placeholder key
   `pending-1780927981071` as if it were the Jira key. This **long draft GUID should not be
   visible** during creation.
5. A newly created story currently lands at the very bottom of the sprint, below the finished
   work. It should instead be inserted **at the bottom of the sprint but above the trailing
   block of done/deprecated stories** (see Image #4: it should land above VPL-46296). Only the
   **contiguous run of DONE/DEPRECATED tickets at the very bottom** counts as that block; a stray
   done/dep ticket higher up in the list is ignored.
6. The backlog / sprint list currently stretches **full width**, leaving the right-hand metadata
   (labels, points, assignee) marooned far from the title on wide screens. The list needs a
   **max width** so it stays readable. It may be **generously wide, but not full-width**; the
   content should be centred (or left-anchored under the toolbar) within that cap.

## Current behaviour

- **Always-on composer (single sprint):** `SprintBoard.tsx` builds `flatCreateTarget` for the open
  sprint / backlog and passes it to `TicketTable.tsx`, which renders `ChildIssueComposer`
  unconditionally at the bottom of the flat list (`TicketTable.tsx`, the `flatCreateTarget` block).
- **Grouped view already has the +:** `TicketTable.tsx` builds a `createAction` (the `+` button)
  per group, passes it into `GroupStatBar` (which renders it in the header cluster next to `...`),
  and only renders the composer when `composerGroupKey === group.key`. The single-sprint header
  (`singleSprintHeader` in `SprintBoard.tsx`) does **not** pass a `createAction`.
- **Refocus after Enter:** `ChildIssueComposer` already creates on Enter, clears the field, and
  keeps focus. So requirement 2 is largely satisfied once the composer is opened via `+`
  (open should `autoFocus`, Escape on empty should close).
- **Composer alignment:** `ChildIssueComposer` lays out as `px-3` + `IssueTypeIcon` + a `Story v`
  type button (`minWidth: 69` when `alignKey`) + the title input. The board rows
  (`BoardRow.tsx`) lay out as `pl-4 pr-[23px] gap-2` + a `w-3.5` checkbox gutter +
  the `TicketStatusPill` (issue icon + key + status) + the title. The two left edges and column
  rhythms differ, so the composer's icon and input do not align with the rows.
- **Draft key:** `SprintBoard.handleCreateTicket` inserts an optimistic ticket with
  `key: pending-${Date.now()}`. `BoardRow` renders that key verbatim until the real Jira key
  comes back, so the `pending-...` GUID is briefly shown.

## Proposed behaviour

### 1. `+` button in the single-sprint header (match the All page)

- Add a `createAction` (`+`) to `singleSprintHeader` in `SprintBoard.tsx`, reusing the same
  button styling/behaviour as the grouped `createAction` in `TicketTable.tsx`.
- The flat composer renders **only when toggled open**, not by default.
- Toggle state shared between the header button and the flat composer (lift to `SprintBoard` or
  thread a `flatComposerOpen` / `onCloseFlatComposer` pair into `TicketTable`).

### 2. Stay open + refocus

- Opening via `+` focuses the input (`autoFocus`).
- Enter creates and clears but keeps the composer open and focused (already implemented).
- Escape on an empty field closes the composer (`onEscapeEmpty`).

### 3. Composer styling (chosen: B3d — raised inset bar)

- **Decision (PO):** the create row is a **raised inset bar** — a bordered, soft-shadowed bar
  floating inside a faint footer strip (`surface-chrome` tint), with the issue-type as a chip
  on the left, the title input, and an `↵ to add` hint on the right. It does **not** try to
  align column-by-column with the rows above; it reads as its own contained control.
- **Surface:** the inner bar, the type chip, and the issue-type dropdown popover all use
  `var(--color-surface-elevated)` (which is `#fff` in light mode, the correct dark surface in
  dark mode). **Do not hardcode `white`** — the app is theme-aware (`data-theme` light/dark) and
  defaults to dark; literal white would render as a stark blob in dark mode. Note: the real
  `ChildIssueComposer` dropdown popover currently sets no background, so this also fixes it.
- Applies to **both views** (single-sprint and grouped / All).

### 4. Hide the draft GUID during creation

- While the optimistic `pending-...` ticket is in flight, the row must not display the raw
  placeholder key. Options: show nothing / a subtle "new" affordance / a spinner in the key slot
  until the real key arrives. Pick the least noisy option during implementation.

### 6. Max width on the backlog / sprint list

- Cap the ticket-list width so rows do not span the full viewport on wide screens. Wide is fine
  (so dense rows still breathe), but not edge-to-edge.
- Choose a sensible cap (e.g. a `max-w-*` token) and centre or left-anchor the list under the
  toolbar. Verify the toolbar / filter bar / group headers stay aligned with the capped list.

### 5. Insert above the trailing done/deprecated block (and show it there before creating)

- Compute the insertion point: the index **immediately before the trailing contiguous run** of
  `DONE` / `DEPRECATED` tickets at the bottom of the target sprint. Only the bottom contiguous
  block counts; a stray done/dep ticket higher up is ignored. No trailing block -> end of list.
- **The create row (composer) renders at that insertion point**, not pinned to the bottom, so the
  PO can see exactly where the new story will land before typing it. If there is a trailing
  done/dep block, the composer sits above it with the finished tickets still visible underneath.
- **On create, the ticket appears at that same spot instantly** via the optimistic update, with no
  visible reflow / refresh / jump:
  - The optimistic ticket is spliced in at the insertion index (not appended then re-sorted).
  - The placeholder -> real-key reconciliation must patch in place (keep position), and must not
    trigger a full list refetch that visibly reorders rows (see [[project_turbopack_cache_invalidate]]
    for why we patch SWR client-side rather than invalidating).
  - The composer stays where it is and refocuses, so several stories can be added in a row, each
    appearing directly above the done/dep block.

## Visual exploration

A throwaway `/dev/composer-alignment` page renders the real board-row geometry next to several
composer alignment mockups so the PO can pick a direction before the production component changes.
**This page is temporary and must be removed (moved to `deleted/`) once the direction is chosen.**

## Implementation Plan

> Produced by the Opus Plan agent. Order, dependencies, and risks below.

### 1. Composer styling — B3d raised inset bar (`ChildIssueComposer.tsx`, shared)
- Restructure into a footer-strip wrapper (`bg-[var(--color-surface-chrome)]/40 px-2.5 py-2.5`, absorbs `className` border) + inner bar (`flex items-center gap-3 rounded-lg border border-border-default bg-[var(--color-surface-elevated)] px-3 py-2 shadow-[var(--shadow-sm)]`).
- Type control becomes a pill chip (`rounded-full border border-border-default bg-[var(--color-surface-elevated)] px-2.5 py-1`, icon + label + chevron) as the `triggerRef`. Drop `alignKey` minWidth (input is `flex-1`); verify alignment.
- Add right-aligned `↵ to add` hint (`rounded border border-border-subtle px-1.5 py-0.5 text-label text-text-muted`).
- Fix the type popover to use `bg-[var(--color-surface-elevated)]` (+ `shadow-[var(--shadow-popover)]`). Never literal `white`.
- Regression-check `EpicChildrenSection`/`EpicChildrenBySprint`; if the strip framing regresses there, gate behind a `variant` prop.

### 2. + button in single-sprint header (`SprintBoard.tsx` + `TicketTable.tsx`)
- SprintBoard owns a new `flatComposerOpen` state (it builds `singleSprintHeader`); pass a `createAction` (`+`, same as grouped) into the `singleSprintHeader` `GroupStatBar` (which already renders `createAction`).
- Thread `flatComposerOpen` + `onToggleFlatComposer`/`onCloseFlatComposer` into TicketTable; gate the flat composer on it (remove the unconditional bottom render).

### 3. Stay open + refocus + Escape-closes (wiring)
- Enter→create+clear+stay-focused already exists. Pass `autoFocus` on open and `onEscapeEmpty` (close) for the flat case (grouped already wires both).

### 4. Hide draft `pending-` key (`TicketStatusPill.tsx`)
- `isPending = ticketKey.startsWith("pending-")`; in the key block render a subtle spinner/dash in the key slot (preserve width so no shift) and disable the key link/dropdown while pending.

### 5. Insert above trailing done/dep block + composer at insertion point + no flicker
- **5a** New pure helper `src/lib/sprint-insert-position.ts`: `trailingDoneDepStart(tickets)` → index before the trailing contiguous DONE/DEPRECATED run (scan from end; no block → length). Co-located unit test.
- **5b** TicketTable renders the composer at `insertIdx` between rows (full-width `<tr>` injected into the flat table body). Virtualization caveat: force non-virtualized while the composer is open.
- **5c** `handleCreateTicket` splices the placeholder at the insertion slot AND sets its `jiraRank` to land at that slot (so the rank-sort in `useSprintBoardFilters` preserves position — no jump). Reconciliation keeps `jiraRank`/position; patch in place, no refetch/`cache.invalidate`. **RISK: verify `jiraRank` is numeric, not a LexoRank string, before 5c.**

### 6. Max width on the list (`SprintBoard.tsx`)
- Keep full-width backgrounds; cap the inner content of toolbar (`SprintSlots`), `FilterBar`, and the list wrapper with a shared `mx-auto w-full max-w-[1600px]` (tune) so all three stay aligned.

### 7. Remove `/dev/composer-alignment`
- Move `src/app/dev/composer-alignment/page.tsx` to `deleted/` (repo rule: never delete). Remove the empty dir; grep for stray links.

### 8. Tests
- `ChildIssueComposer.test.tsx`: pill chip + hint render; Enter creates+clears+keeps focus; Escape-empty closes; popover elevated bg.
- `TicketTable.test.tsx`: flat composer hidden by default; `+` toggles; renders at insertion index (precedes trailing done rows).
- `SprintBoard.test.tsx`: create keeps composer open; `pending-` key not rendered.
- `sprint-insert-position.test.ts`: helper cases.

### Order
1) Composer styling §1 → 2) helper §5a → 3) pending-key §4 → 4) toggle plumbing §2/§3 → 5) composer-at-index + splice + rank §5b/§5c → 6) max-width §6 → 7) move dev page §7 → 8) tests throughout.

### Key risks
- **`jiraRank` type** is the linchpin of "no flicker" — verify numeric vs LexoRank string first.
- **Virtualization vs injected composer row** — disable virtualization while composer open.
- **Shared composer blast radius** — epic child views; gate behind `variant` if needed.

## Acceptance criteria

- [x] Single-sprint view: no composer shown until `+` is clicked; `+` lives in the sprint header
      next to `...`, matching the All / grouped page.
- [x] After Enter, the composer stays open and the input is refocused for the next story.
- [x] Escape on an empty composer closes it.
- [x] The composer uses the B3d "raised inset bar" styling (white inner bar + type chip + dropdown via `surface-elevated`, `↵ to add` hint) in both views.
- [x] The `pending-...` draft key is never visible while a story is being created.
- [x] The create row renders at the insertion point (above the trailing done/dep block), not pinned to the bottom.
- [x] A new story appears at that exact spot instantly on create, with no visible reflow/refresh/jump.
- [x] The backlog / sprint list has a max width (wide but not full-width); toolbar and headers stay aligned.
- [x] The `/dev/composer-alignment` exploration page is removed after the direction is chosen.
- [x] Tests cover: composer hidden by default, create keeps it open + refocused, the composer
      renders at the insertion index, and the draft key is not rendered for `pending-` tickets.
      <!-- The header "+" itself is a thin state toggle wired to flatComposerOpen, which the
      TicketTable hidden/shown/position tests exercise directly; SprintBoard mocks TicketTable so
      the button cannot be integration-clicked there. -->

## Notes

- The `+` / composer pattern is shared (`ChildIssueComposer`, `GroupStatBar`, `TicketTable`), so
  any alignment change affects the grouped view too.
- **Decision (PO):** apply the chosen B3d styling to **both views** (single-sprint and grouped /
  All) for consistency.
