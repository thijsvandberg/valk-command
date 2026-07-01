# BRDG-454: Multiselect toolbar shows two SP totals (SP-only and SP + guestimate)

**Status:** To Do
**Priority:** Low
**Type:** Feature

## Description
When multiple tickets are selected on the sprint board, the floating bulk-action toolbar shows a single SP badge (`# N`) summing the Story Points of the selected tickets. Tickets without real SP but with a Bridge-local guestimate contribute nothing to that number, so the total understates the real planning weight of the selection.

The PO wants two SP totals side by side:

1. **SP-only** — the current behaviour: sum of real `storyPoints`.
2. **SP + guestimate** — the same sum, but for tickets without SP the guestimate is counted instead ("effective points").

Confirmed with the PO:
- The combined value uses **effective points**: per ticket, count `storyPoints` if set, otherwise the `guestimation`. A ticket that has both SP and a retained guestimate counts its SP only (no double-counting).
- The second (combined) total is shown **only when it differs from the SP-only total** — i.e. only when at least one selected ticket has no SP but does have a guestimate. Otherwise the two numbers would be identical and only the SP-only badge is shown.

## Current Behaviour
- The floating toolbar is `BulkActionBar` (`src/components/sprint-board/BulkActionBar.tsx`). It renders the selection counter plus optional SP and BV badges. <!-- lines 241-250 -->
- The SP badge is a `MetricBadge metric="sp"` shown only when `selectedPoints > 0`; BV is the same with `metric="bv"`. <!-- BulkActionBar.tsx:244-249 -->
- The totals are computed inline in `SprintBoard.tsx` when building the bar: `selectedPoints={sel.reduce((s, t) => s + (t.storyPoints ?? 0), 0)}` and `selectedBV={sel.reduce((s, t) => s + (t.businessValue ?? 0), 0)}`, where `sel = tickets.filter((t) => checkedTickets.has(t.key))`. <!-- SprintBoard.tsx:1126-1129 -->
- Guestimate already exists as a Bridge-local forward-planning estimate: `guestimation` (nullable int) on the ticket, stored in `ticketMetadata` (`src/db/schema.ts`), Fibonacci scale, kept even after real SP is set (BRDG-323). <!-- src/types/ticket.ts, schema.ts -->
- The "SP wins, else guestimate" rule is already codified as `effectivePoints(storyPoints, guestimation)` in `src/types/ticket.ts:153` and is exactly what the fullness meter uses for the "used" total (`GroupStatBar.tsx:301`). This is the helper to reuse — no new logic.

## Proposed Approach
Reuse the existing dual-badge pattern already in the toolbar (SP + BV side by side) and the existing `effectivePoints` helper. No data-model or API changes.

1. **Compute the combined total** in `SprintBoard.tsx` next to the existing reducers: `selectedEffectivePoints = sel.reduce((s, t) => s + effectivePoints(t.storyPoints, t.guestimation), 0)`. Pass it to `BulkActionBar` as a new optional prop `selectedEffectivePoints`.
2. **Render a second badge** in `BulkActionBar` right after the SP badge, gated on `selectedEffectivePoints !== undefined && selectedEffectivePoints > selectedPoints`. That single guard covers "only show when it differs", because effective points can only ever be greater than SP-only (SP-only never counts guestimates, effective points adds them for SP-less tickets).
3. **Visual distinction** so the two slate badges are not confused: the combined badge keeps the SP slate tone but wears the "penciled-in" dashed treatment already used for guestimates on rows (dashed border, matching the row marker family), with a tooltip like `Story Points + guestimate for unestimated tickets`. The plain SP badge is unchanged. See Open Questions for the exact marker if the dashed treatment reads poorly at badge size.

The same treatment is applied to the two sprint-board surfaces that show an SP total: the primary board (`SprintBoard.tsx`, single-sprint and grouped/All views) and the side-by-side compare view (`MultiSprintView.tsx`, `/sprint-board/compare`). Both pass `selectedEffectivePoints` alongside `selectedPoints`.

**Out of scope / non-goals:**
- No change to the SP-only badge, the BV badge, or the inbox variant of the toolbar (inbox does not pass SP totals).
- The epic-detail child-ticket bulk bar (`EpicChildrenSection.tsx`) also shows an SP total and could get the same combined badge (`EpicChild` carries `guestimation`), but it is a separate surface outside the sprint board; left as a follow-up (see Open Questions).
- No change to how guestimate or SP are stored, edited, or synced.
- No change to the per-group `GroupStatBar` header totals or the fullness meter — this story is only the bulk-selection toolbar.
- The literal "sum of all SP + sum of all guestimates" interpretation (double-counting tickets that have both) was explicitly rejected.

## Open Questions
- **Extend the combined badge to the epic-detail child-ticket bulk bar?** `EpicChildrenSection.tsx` shows an SP total for selected epic children and `EpicChild` carries `guestimation`, so the same badge is a drop-in. Not done here (separate surface, outside the sprint board). Recommended default: add it in a small follow-up if PO wants full consistency across every bulk bar.
- **Exact visual marker for the combined badge.** RESOLVED: implemented the recommended default — the solid/tinted slate badge is the committed SP total, the dashed "penciled-in" slate badge (`MetricBadge penciled`) is the SP + guestimate total, with tooltip `Story Points + guestimate for unestimated tickets`. If review finds the dashed border too subtle at this size, a short `+g` label or distinct icon remains a drop-in follow-up (behaviour unaffected).

## Implementation Plan
**Design decision:** render the combined total with `MetricBadge metric="sp"` but a dashed "penciled-in" treatment (no fill, slate text) to match the board's guestimate marker language — solid/tinted SP = committed points, dashed SP = includes guestimate. A small dedicated `penciled` prop on `MetricBadge` carries this (kept separate from the existing `dimmed` prop, which means "column hidden from rows" and is intentionally faded). Tooltip: `Story Points + guestimate for unestimated tickets`.

1. `MetricBadge.tsx` — add an optional `penciled?: boolean` prop that applies a dashed slate outline with no fill (reuses the dashed/no-fill guestimate language, full opacity). <!-- MetricBadge.tsx dimmedCls area ~76-81 -->
2. `SprintBoard.tsx` — add a value import of `effectivePoints`, compute `selectedEffectivePoints = sel.reduce((s, t) => s + effectivePoints(t.storyPoints, t.guestimation), 0)`, pass it as a new prop. <!-- import ~line 8, builder ~line 1126-1128 -->
3. `BulkActionBar.tsx` — add `selectedEffectivePoints?: number` to props; render a second SP badge (`penciled`, with the tooltip) right after the SP-only badge, gated on `selectedEffectivePoints !== undefined && selectedPoints !== undefined && selectedEffectivePoints > selectedPoints`. The `>` gate alone guarantees it only shows when it differs (effective points can never be less than SP-only). <!-- props ~119/158, render ~244-250 -->
4. Tests in `BulkActionBar.test.tsx` + a `penciled` render test in `MetricBadge.test.tsx`.

## Acceptance Criteria
- [x] With multiple tickets selected, the toolbar shows the SP-only total exactly as today (sum of real `storyPoints`). <!-- BulkActionBar.tsx:244, SprintBoard.tsx:1128 -->
- [x] When at least one selected ticket has no SP but has a guestimate, a second total appears next to it showing SP + guestimate, computed as the sum of `effectivePoints(storyPoints, guestimation)` over the selection. <!-- effectivePoints in src/types/ticket.ts:153 -->
- [x] A ticket that has both real SP and a retained guestimate contributes only its SP to the combined total (no double-counting). <!-- effectivePoints: storyPoints wins -->
- [x] When no selected ticket adds a guestimate (combined total equals SP-only), only the SP-only badge is shown. <!-- guard: selectedEffectivePoints > selectedPoints -->
- [x] The combined badge is visually distinct from the SP-only badge and carries a tooltip explaining it includes guestimates for unestimated tickets. <!-- MetricBadge penciled dashed treatment + tooltipContent -->

## Tests
- [x] `BulkActionBar` shows only the SP badge when `selectedEffectivePoints === selectedPoints` (no guestimate-only tickets). <!-- src/components/sprint-board/BulkActionBar.test.tsx -->
- [x] `BulkActionBar` shows both badges with the correct combined value when `selectedEffectivePoints > selectedPoints`. <!-- BulkActionBar.test.tsx -->
- [x] Existing `effectivePoints` behaviour (SP wins, else guestimate, 0/null handling) stays green. <!-- src/types/ticket.test.ts (already covers this) -->

## Related
- [[BRDG-323]] — guestimate is retained after real SP is set; the reason a ticket can hold both and why the combined total must not double-count.
- [[BRDG-303]] — forward-planning mode / guestimate concept.
- [[BRDG-321]] — SP/BV/guestimate marker family (slate/violet, penciled guestimate treatment) this reuses.
- `effectivePoints` (`src/types/ticket.ts:153`) and `GroupStatBar`'s fullness meter (`GroupStatBar.tsx:301`) — same SP-wins-else-guestimate rule.
