# BRDG-441: Inbox header — segmented All/New + select-all, and an aligned checkbox column

**Status:** To Do
**Priority:** Medium
**Type:** Feature

## Description
Two inbox polish items, design chosen in the `/dev/exploration/inbox-counts` sandbox (variant A):

1. **Clearer header control (variant A).** Replace the current `9 · 4 new` pills — two unlabelled count chips whose clickability and purpose are unclear — with a segmented **All / New** control plus a **Select all** action right beside it. The segmented switch makes filtering obvious (active segment filled; the New segment carries the brand dot + new count, the All segment the total unread). Select-all selects exactly the shown set, labelled "Select all new" when filtered to New — so filtering *and* selecting both live in the header.
2. **Aligned checkbox column.** On the inbox, the group-header "select all" checkbox and the per-row checkboxes don't sit on one clean vertical line. Line them up so the checkbox column reads crisp.

Both reuse the BRDG-438 wiring (the `newOnly` filter, `displayRows`, `toggleAll`); no change to what "new" means.

## Current Behaviour

**Header counts (BRDG-438).** In `src/app/(app)/inbox/page.tsx`, after `<ViewHeaderTitle>Inbox</ViewHeaderTitle>` the header renders a total-unread badge button (`onClick` clears `newOnly`) followed by a clickable "N new" chip (`onClick` toggles `newOnly`). The page already owns: `newOnly` (settable from `?new=1`), `newCount` (= `rows.filter(isNew).length`), `displayRows` (= `newOnly ? filteredRows.filter(isNew) : filteredRows`), `allChecked`/`toggleAll` (over `displayRows`). So the segmented control + select-all are a presentation swap over existing state — no new logic.

**Checkbox geometry.** The per-row checkbox (`BoardRow`) sits in a `w-3.5` gutter at the row's `pl-4` inset, so its 14px glyph starts at x≈16px. The group-header "select all" (`GroupStatBar`, rendered when `onSelectAll` is passed) is a `h-5 w-5` button inside `GroupCard`'s header at `px-3`, so its 14px glyph is centred at x≈15px. The ~1px offset (plus the differing box widths) makes the column read ragged. `GroupStatBar`'s select-all checkbox is used by **only two surfaces**: the inbox and `EpicChildrenBySprint` (epic children grouped by sprint) — `grep onSelectAll`. The main sprint board (`TicketTable`) does not render a group select-all checkbox, so aligning it does not touch the board's group headers' checkbox (the board has none); only the chevron/label inset is shared via `GroupCard`.

**Prototype.** `src/app/dev/exploration/inbox-counts/page.tsx` (variant A) shows the chosen header control and the "Today vs Aligned" checkbox columns with a guide line.

## Proposed Approach

### Part 1 — Header control (variant A)
In the inbox header block (`page.tsx`, the `data && (...)` after `ViewHeaderTitle`):
- Render a **segmented control** when `newCount > 0`: a pill container (`rounded-full bg-overlay-subtle p-0.5`) with two segments — `All {rows.length}` and `New {newCount}` (the New segment prefixed by the brand dot). Active segment filled: All-active = neutral elevated (`bg-surface-floating text-text-primary shadow-sm`); New-active = `bg-[var(--color-brand-500)] text-white`. Clicking All → `setNewOnly(false)`, New → `setNewOnly(true)`. When `newCount === 0`, fall back to the plain total badge (no New segment). <!-- page.tsx header; reuse newOnly/newCount -->
- Render a **Select all** button beside it (shown when `displayRows.length > 0`): a `Checkbox` reflecting `allChecked` + label "Select all" / "Select all new" (when `newOnly`) + the shown count; `onClick` → `toggleAll` (which already toggles the full shown set off when all are checked). <!-- reuse allChecked/toggleAll over displayRows -->
- Match the exploration's variant-A styling/tokens (brand family, `--color-brand-subtle`, `text-label`).

### Part 2 — Aligned checkbox column
Align the `GroupStatBar` select-all checkbox glyph to the row checkbox glyph x (the exploration's "Aligned" card: the select-all sits in a `w-3.5` gutter at the same `pl-4`-equivalent inset as the rows, with the chevron moved into the `w-2` lane that the BRDG-434 new-dot occupies, so the label also lines up with the issue-icon column). Because this geometry is shared, verify both other consumers: the **sprint board** group headers (chevron/label inset via `GroupCard`) and **epic-children-by-sprint** (which also renders the select-all). See Open Questions for the inbox-only-vs-global scope. <!-- GroupStatBar select-all + GroupCard header inset vs BoardRow pl-4/w-3.5 -->

**Non-goals / out of scope**
- Not changing the "new" definition or the BRDG-438 read-based baseline.
- Not adding the control to the nav sidebar badge, nor redesigning the bottom bulk-action bar / per-group select-all checkboxes (the header select-all complements them: it selects all *shown* across groups).
- Not touching the digest deep-link (`?new=1` still lands on New).

## Open Questions
- **Alignment scope: inbox-only or global?** Recommended default: **fix it where the select-all renders** (a shared `GroupStatBar`/`GroupCard` tweak), since the only two select-all surfaces — inbox and epic-children-by-sprint — are both `BoardRow`-based and benefit identically, and the sprint board renders no group select-all so its checkbox column is unaffected. Require visually verifying the sprint board + epic-children group headers don't shift. If the shared change nudges the board's chevron/label inset undesirably, fall back to an opt-in prop (e.g. `alignSelectAllToRows`) that the inbox + epic host pass.

## Implementation Plan
1. **Header control.** Swap the two count badges in `page.tsx` for the segmented All/New control + the Select-all button, wired to existing `newOnly`/`newCount`/`allChecked`/`toggleAll`/`displayRows`.
2. **Checkbox alignment.** Adjust the `GroupStatBar` select-all (and, if needed, the `GroupCard` header inset) so its glyph shares the row checkbox's x; verify inbox, epic-children, and sprint board.
3. **Tests + visual check.** Update/extend the inbox page tests for the segmented control + select-all; browser-verify alignment on all three surfaces.

## Acceptance Criteria
- [ ] The header shows a segmented All/New control: `All {total}` + `New {newCount}` (brand dot on New), active segment filled; the New segment is hidden when `newCount` is 0. <!-- page.tsx header; newOnly/newCount -->
- [ ] Clicking All shows all unread; clicking New filters to new — driven by the existing `newOnly`/`displayRows`. <!-- setNewOnly + displayRows -->
- [ ] A Select-all button beside the control selects exactly the shown set and toggles off when all shown are selected; its label reads "Select all new" while New is active. <!-- toggleAll over displayRows; allChecked -->
- [ ] On the inbox, the group-header select-all checkbox and the row checkboxes sit on one vertical column. <!-- GroupStatBar select-all aligned to BoardRow pl-4/w-3.5 -->
- [ ] The sprint board group headers and the epic-children-by-sprint group headers are visually unchanged (or improved) — no regression from the shared change. <!-- verify GroupStatBar/GroupCard consumers -->
- [ ] `?new=1` (digest deep-link) still lands with the New segment active. <!-- newOnly init unchanged -->

## Tests
- [ ] Header renders the segmented control with the right counts; the New segment is absent when `newCount` is 0; clicking All/New toggles `newOnly`. <!-- src/app/(app)/inbox/page.test.tsx -->
- [ ] Select-all checks exactly the shown keys and its label switches to "Select all new" under `newOnly`; a second click clears. <!-- src/app/(app)/inbox/page.test.tsx -->
- [ ] Checkbox alignment is visual: verified via build + browser screenshots on inbox / board / epic-children (noted, not unit-tested). <!-- manual/visual -->

## Related
- [[BRDG-438-inbox-new-unread-count-filter-digest-deeplink]] — provides `newOnly`, `displayRows`, `newCount`, `allChecked`, `toggleAll`; this restyles the header that story shipped.
- [[BRDG-434-inbox-new-since-last-visit]] — the per-row new-dot slot whose lane the group chevron moves into for alignment.
- `src/app/dev/exploration/inbox-counts/page.tsx` — the chosen variant-A prototype + the "Aligned" checkbox column.
- `src/components/sprint-board/GroupStatBar.tsx` / `GroupCard.tsx` / `BoardRow.tsx` — the shared components the alignment touches.
