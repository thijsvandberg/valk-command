# BRDG-389: Refinement list and cleanup list adopt the shared BoardRow

**Status:** Completed
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

## Implementation Plan

> Produced by an Opus Plan agent against the current tree (2026-06-24). File/symbol-level reference for the three phases.

### Key decisions (resolved up front)

- **A — the `metadataSlot` gap.** Add an opt-in `metadataSlot?: React.ReactNode` to `BoardRow` in **Phase 1** (both later phases need it). Render it once, trailing, click-isolated, `z-20`, mirroring `ChildIssueRow`. For **refinement** and **cleanup**, put ALL list metadata into the slot (`tags={new Set()}` so BoardRow renders no native metadata of its own). Rationale: refinement's `InRefinementBadge` / "In other session" text have no native BoardRow equivalent, and cleanup's badges (deprecation/revival/disposition/last-scanned) are entirely bespoke; passing the existing metadata block through the slot is the minimal-change, lowest-regression path.
- **B — refinement drag handle.** Add an optional external `dragHandleSlot?: React.ReactNode` to `BoardRow`, rendered in the left gutter exactly as `ChildIssueRow` (absolute, hidden when `someChecked`), and suppress BoardRow's native grip when a `dragHandleSlot` is present. Rationale: the refinement list does not reorder (no `SortableBoardRow`), so the native grip is irrelevant; the BRDG-336 `TicketDragHandle` must stay a gutter descendant to preserve the affordance + the `getByLabelText("Drag … to a refinement session")` test.
- **C — cleanup adapter.** Add a dedicated `cleanupRowToTicket(row: CleanupRow): Ticket` in `src/lib/cleanup-types.ts` (already client-safe, owns `CleanupRow`), mirroring `epicChildToTicket`. Do NOT reuse the in-page `rowToTicket` (that is the SidePanel adapter). `sprintId` is omitted on purpose (metadata is slot-rendered; `tags` empty so the native sprint chip never fires). Add a unit test.
- **D — refinement FLIP.** `useFlipReorder` queries `[data-ticket-key]`; BoardRow exposes only `data-index`. Add an opt-in `"data-ticket-key"?: string` pass-through to BoardRow's `<tr>` and have `RefinementTicketList` pass `data-ticket-key={ticket.key}`.

### Phase 1 — BoardRow opt-in props (no host changes)
- `spacious?: boolean` → inner content `<div>` padding `py-[10px]` vs `py-[7px]`.
- `inlineCheckbox?: boolean` → `showCheckbox = isChecked || someChecked || inlineCheckbox` (box stays `opacity-100`).
- `metadataSlot?: React.ReactNode` → trailing, after the assignee block, `z-20` click-isolated span.
- `dragHandleSlot?: React.ReactNode` → left-gutter absolute span (hidden when `someChecked`); native grip guard gains `&& !dragHandleSlot`.
- `"data-ticket-key"?: string` → pass-through on the `<tr>`.
- Keep `memo(forwardRef)` + React-Compiler clean (no new hooks). `SortableBoardRow` forwards them automatically via `...rowProps`.
- Tests in `BoardRow.test.tsx`: spacious padding, inlineCheckbox always-visible, metadataSlot renders/inert, dragHandleSlot renders + suppresses native grip + hidden on `someChecked`.

### Phase 2 — Cleanup list migration
- Add `cleanupRowToTicket` to `cleanup-types.ts` + unit test.
- `cleanup/page.tsx`: replace `ChildIssueRow` import with `BoardRow` + adapter. Per-card `<div className="overflow-clip rounded-xl border …"><table className="w-full table-fixed border-collapse text-body-lg"><tbody>…</tbody></table></div>`. Each row is a `<BoardRow>` `<tr>`; the `RationaleLine` moves into a second `<tr><td className="p-0">…</td></tr>` in the same `<tbody>` (only when `row.scanRationale`).
- BoardRow props: `ticket={cleanupRowToTicket(row)}`, `spacious`, `inlineCheckbox`, `tags={EMPTY_TAGS}`, `isChecked`, `someChecked={checkedKeys.size>0}`, `onCheckboxClick={(key)=>toggleRow(key)}`, `isSelected={active}`, `selectedTicket={null}` + `onSelectTicket={(key)=>key && setReviewKey(key)}` (preserve "click always opens"), `isLastInCard`, `metadataSlot={metadata}` (the existing block verbatim).
- Remove `rowToSubtask`. Keep `rowToTicket` (SidePanel) untouched.
- `page.test.tsx`: re-point the `ChildIssueRow` mock to `BoardRow` (props `ticket`/`onSelectTicket`/`onCheckboxClick(key,idx,shiftKey)`/`metadataSlot`); drop the `data-show-type-icon` assertion (BoardRow's list pill always shows the type icon).

### Phase 3 — Refinement list migration
- `RefinementTicketList.tsx`: replace `ChildIssueRow` with `BoardRow` (tickets are already full `Ticket`s → no adapter). Inner container becomes `<div ref={listRef} …><table …><tbody>…</tbody></table></div>` (FLIP wrapper keeps `listRef`).
- Per row: `ticket={ticket}`, `spacious`, `inlineCheckbox`, `tags={EMPTY_TAGS}`, `isChecked`, `isSelected={ticket.key===previewTicketKey}`, `someChecked={false}` (preserve), `data-ticket-key={ticket.key}`, `dragHandleSlot={<TicketDragHandle ticketKey={ticket.key} source="list" />}`, `onCheckboxClick` → `queueHook.toggleTicket(key,idx,shiftKey)`, `selectedTicket={null}` + `onSelectTicket={(key)=>key && onSelectTicket(key)}`, edit callbacks straight through, `readinessMap` built once (preserve optimistic readiness), `sprintNameMap` passed so derived hoverData resolves, drop the explicit `hoverData` block, `metadataSlot={metadata}` (existing block verbatim, field-visibility still drives it). `showKey`/`showStatus` map to BoardRow; the "Type icon" toggle becomes a no-op (align with board, annotate — same as BRDG-367 R2).
- `RefinementTicketList.test.tsx`: re-point mock to `BoardRow`, `data-active` now from `isSelected`, preserve drag-handle + toggleTicket + onSelectTicket assertions.

### Risks
- R-typeicon-toggle: refinement "Type icon" toggle can no longer hide the leading icon (BoardRow list pill always shows it). Align with the board, annotate.
- R-cleanup-tint: active tint moves to the row `<tr>` only, not the rationale `<tr>` (minor; acceptable).
- R-selectedTicket-toggle: BoardRow's toggle-to-null differs from "always open"; resolved via `selectedTicket={null}` + guarded `onSelectTicket`.

## Preconditions

- [x] BRDG-367 merged (the `BoardRow` reuse pattern is in place).
- [x] Clean working tree; commit each phase as its own logical unit. <!-- Tree carries unrelated parallel work in src/app/(app)/tickets/[key]/page.tsx, TicketTabContent.tsx, ticket-detail-url.ts (ticket-detail, no overlap with this story's BoardRow/cleanup/refinement scope). Staging explicit paths only; never stage all. -->

## Phase 1: Add `spacious` + `inlineCheckbox` to `BoardRow`

- [x] Add `spacious?: boolean` (extra row padding) and `inlineCheckbox?: boolean` (always-visible in-flow checkbox) to `BoardRow`, both default-off and inert for existing hosts. <!-- also added the host-inert metadataSlot + dragHandleSlot + data-ticket-key pass-through here (decisions A/B/D) since both later phases need them; SortableBoardRow forwards them via ...rowProps -->
- [x] Unit-test the two variants on `BoardRow`; confirm no visual change for the board / inbox / Story Writer / epic hosts. <!-- 61 BoardRow tests pass incl. new spacious/inlineCheckbox/metadataSlot/dragHandleSlot/data-ticket-key cases; all new props default-off so existing host tests unchanged -->

## Phase 2: Migrate the cleanup list

- [x] Add a `*->Ticket` adapter for the cleanup items (or reuse one if a Subtask adapter exists). <!-- cleanupRowToTicket in src/lib/cleanup-types.ts (mirrors epicChildToTicket); sprintId intentionally omitted; + unit tests -->
- [x] Render the cleanup list rows via `BoardRow` inside a per-card `<table><tbody>`, with `spacious` + `inlineCheckbox`. <!-- tags={EMPTY_TAGS} so all metadata stays in the slot; hideRowAccent for the flat-list look; rationale moved to its own single-column <tr> -->
- [x] Preserve selection, the metadata shown, and any cleanup-specific behaviour at the page level. <!-- existing metadata block passed verbatim via metadataSlot; active tint via isSelected; selectedTicket=null + guarded onSelectTicket keeps "click always opens the review drawer" -->
- [x] Remove `ChildIssueRow` from `src/app/(app)/cleanup/page.tsx`. <!-- import + rowToSubtask removed; rowToTicket (SidePanel adapter) kept -->
- [x] Update cleanup tests; `npm run verify` + `npm run build` green; PO visual check. <!-- mock re-pointed to BoardRow; data-show-type-icon assertion dropped (list pill always shows the type icon); cleanup page (19) + adapter (11) tests pass. Full verify + build + visual in final verification. -->

## Phase 3: Migrate the refinement list

- [x] Decide the drag-handle approach (external slot on `BoardRow` vs handle adjacent to the row) and implement it. <!-- chose the external dragHandleSlot on BoardRow (decision B); TicketDragHandle stays a gutter descendant, suppresses the native grip, hidden during multiselect -->
- [x] Render `RefinementTicketList` rows via `BoardRow` (`spacious` + `inlineCheckbox`), wiring the existing edit callbacks straight through; drop the explicit `hoverData` if `BoardRow` derives it adequately. <!-- callbacks (jira-status/readiness/assignee/epic/sprint/SP/BV) pass through key-first; explicit hoverData dropped, BoardRow derives it from ticket + readinessByKey + sprintNameMap; tags={poReadiness} keeps the readiness dot, all other metadata via metadataSlot. Added isFirstInCard to BoardRow for the card's top-row rounding (card keeps overflow-clip-margin for the handle bleed + FLIP). -->
- [x] Preserve the "drag ticket into queue" behaviour (BRDG-336) and selection. <!-- someChecked stays false so the inline checkbox + handle coexist; data-ticket-key passthrough keeps useFlipReorder working -->
- [x] Remove `ChildIssueRow` from `RefinementTicketList`. <!-- import + all usages removed; showIssueType dead const removed (Type-icon toggle now a no-op, menu entry kept) -->
- [x] Update refinement tests; `npm run verify` + `npm run build` green; PO visual + drag check. <!-- mock re-pointed to BoardRow; 20 refinement tests pass. Full verify + build + visual in final verification. -->

## Acceptance Criteria

- [x] The cleanup list and the refinement available-tickets list render rows via `BoardRow`. <!-- e2e-verified in headless Chrome: cleanup 280 BoardRow rows, refinement 43 BoardRow rows -->
- [x] `ChildIssueRow` is no longer imported by the cleanup page or `RefinementTicketList`. <!-- both imports removed; ChildIssueRow.tsx still serves SubtasksSection / LinkedIssueRow (out of scope) -->
- [x] Selection, metadata, and the refinement "drag into queue" affordance behave as before. <!-- cleanup selection -> "1/280 selected" bulk bar + row tint; refinement queued rows show in the queue panel; 43 "Drag … to a refinement session" handles present; readiness dot + epic/SP/BV/subtasks/sprint badges render; no console / DOM-nesting errors -->
- [x] No regression on the other `BoardRow` hosts (board, inbox, Story Writer, epic-children). <!-- full suite (6496) green incl. those hosts; all new BoardRow props default-off -->
- [x] `npm run verify` and `npm run build` pass. <!-- verify: lint + typecheck clean, 6496 tests pass; build clean -->

## Out of scope

- The **inbox** (already on `BoardRow`).
- `ChildIssueRow`'s harder hosts: **subtasks** (`SubtasksSection`) and **linked issues** (`LinkedIssueRow`) — they use `actionsSlot` and/or inline rename, which `BoardRow` lacks; a separate follow-up.
- The Compare view's legacy `TicketRow` (covered by BRDG-388).
- The refinement **queue** ordering DnD, unless it turns out to render `ChildIssueRow` too.

## References

- [BRDG-367: Epic-children list adopts the shared BoardRow](completed/BRDG-367-epic-children-adopt-board-row.md) — the precedent (adapter + `<table>` wrap + opt-in `BoardRow` props).
- [BRDG-388: Compare view adopts the shared BoardRow](BRDG-388-compare-view-adopt-board-row.md) — sibling migration.
- [docs/investigations/2026-06-17-unified-issue-row.md](../investigations/2026-06-17-unified-issue-row.md) — original row-unification analysis.
