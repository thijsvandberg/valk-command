# BRDG-331: Slim, legible epic progress roll-up on the Child issues tab

**Status:** To Do
**Priority:** Medium

## Description

The epic roll-up above the child list (the `EpicStatsSummary` card) reads as a detached widget you have to decode:

- It floats as a fully-elevated card above the list, separate from the content it summarizes.
- Two unlabelled number systems sit side by side: loud status pills (`TO DO: 15 / IN PROGRESS: 2 / DONE: 5`) on the left and a block (`22 ITEMS · 18 SP · 37 BV`) on the right that is secretly a toggle deciding what the bar measures.
- The bar ends in a bare `27%` with no stated meaning.

Two things also changed the context around it:

1. **Child issues now live on their own tab.** The tab bar already says "Child issues", so the separate `ChildIssueListHeader` rendering a "Child Issues  22 of 26  ⋯" section header below the roll-up is a redundant repeat of the tab.
2. **The most-used list is grouped by sprint** (`GroupStatBar` headers with per-sprint roll-ups). The epic roll-up is the "all sprints combined" total and sits above those group cards.

We explored four directions at `/dev/exploration/epic-progress` and chose **variant B — the slim one-line toolbar**:

- One compact toolbar row above the sprint groups: **count `22 of 26` · segmented progress bar · `27% done` · metric toggle (items / SP / BV) · ⋯ menu**.
- **No standing status labels.** The status breakdown moves onto the bar: hovering a segment reveals a styled tooltip with that status, its count for the active metric and its share (e.g. "5 items · done · 23%").
- The redundant "Child Issues" section title is removed; its useful parts (the `22 of 26` count and the ⋯ actions: view, filter, columns, new child issue, plus the status filter and a "Hide progress summary" toggle) fold into this one row.
- Each sprint group keeps its own collapse chevron (this replaces the old section-level collapse). The summary itself is shown/hidden via the ⋯ menu, persisted like the existing metric choice.

As a PO, I want a single calm line that tells me how the epic is progressing and lets me drill into the breakdown on demand, without a chunky decode-me card or a duplicated section header.

## Implementation Plan

**Architecture decisions (final):**

- **D1.** New component `EpicProgressToolbar.tsx` replaces `EpicStatsSummary.tsx` (delete the old file). It is a slim row, not an elevated card. It owns: the metric (`useLocalStorage("epic-stats-metric")`), the count badge, the `SegBar` (per-segment hover tooltips), the `NN% done` label, the `MetricToggle`, and an `actions` slot rendered on the right.
- **D2.** **One ⋯ menu**, not two. `ChildIssueListHeader` keeps its rich multi-pane ⋯ (View/Filter/Columns/New/AI) and gains a "Hide/Show progress summary" item. It is rendered into the toolbar's `actions` slot so the whole thing is one row with one ⋯.
- **D3.** The `hidden` preference is lifted to `EpicChildrenSection` (`useLocalStorage("epic-stats-summary-hidden", false)`) because both the toolbar (to hide its bar/toggle) and `ChildIssueListHeader`'s menu (to render the toggle item) need it.
- **D4.** The count (`X of Y` / `Y`) moves from `ChildIssueListHeader`'s `SectionHeader` into the toolbar's `CountBadge`. `ChildIssueListHeader` stops using `SectionHeader`; drops `title`, `count`/`countLabel`, `sectionKey`; renders just `{extraActions}{menu}`.
- **D5.** The status filter stays reachable via the ⋯ Filter pane (no more status pills). `onSelectStatus`/`activeStatus` are dropped.
- **D6.** Retire the section-level collapse for this surface: remove `useSectionCollapsed`/`collapsed` gate and `sectionKey` from `EpicChildrenSection`, and delete the `epicChildren` key from `SECTION_KEYS`. Per-sprint group chevrons in `EpicChildrenBySprint` are independent and untouched. Always render the list/group content.

**Order:** (1) create `EpicProgressToolbar.tsx` porting `SegBar`/`MetricToggle`/tooltip from the exploration with real roll-up math; (2) strip `ChildIssueListHeader` + add hide/show menu item; (3) wire both into `EpicChildrenSection` (one row, lift `hidden`, remove collapse gate); (4) remove `epicChildren` from `SECTION_KEYS`; (5) delete `EpicStatsSummary.tsx` + its test; (6) tests; (7) verify.

**Tooltip pitfall:** the colored segment `<span>` needs an explicit `height` style (a `%`/`h-full` height collapses to 0 inside the inline-flex Tooltip wrapper). Port verbatim.

**Tests:** delete `EpicStatsSummary.test.tsx`; add `EpicProgressToolbar.test.tsx` (null on empty/all-deprecated; `X of Y` vs `Y`; `aria-valuenow` per metric; metric toggle recompute + persist; no standing pill labels; segment hover shows tooltip; segment span has non-zero inline height; hide/show persists and keeps count visible); update `EpicChildrenSection.test.tsx` (no "Child Issues" title; toolbar present; per-sprint chevrons still work; flat view renders) and `TicketTabContent.test.tsx` if it references the old card.

## Acceptance Criteria

- [x] The floating `EpicStatsSummary` card is replaced by a single slim toolbar row above the grouped sprint list on the Child issues tab.
- [x] The toolbar shows: the `X of Y` child count, the segmented progress bar, a `NN% done` label, the items / SP / BV metric toggle, and the ⋯ actions menu.
- [x] The loud `TO DO: 15 / IN PROGRESS: 2 / DONE: 5` status pills are gone. Hovering a segment of the bar shows a styled tooltip (reusing `@/components/shared/Tooltip`) with the status, its count for the active metric, and its percentage share.
- [x] The metric toggle drives both the bar and the `NN% done` figure; the selected metric persists (as today, via `useLocalStorage` `epic-stats-metric`).
- [x] The redundant "Child Issues" section title from `ChildIssueListHeader` is removed; the count and all of its actions (view mode, filter, columns, new child issue, status filter) remain reachable from the toolbar's ⋯ menu. <!-- ChildIssueListHeader is now dual-mode: title-less menu cluster inside the toolbar for the epic tab; still renders the collapsible SectionHeader when a `title` is passed (SubtasksSection, which shares this component). -->
- [x] The status filter is still available (from the ⋯ menu) and still filters the child list. <!-- via the menu's Filter pane (FieldFilterSections), unchanged -->
- [x] A "Hide progress summary" action in the ⋯ menu hides the bar/breakdown; the preference persists (localStorage `epic-stats-summary-hidden`, lifted to EpicChildrenSection) and the toolbar still shows the count + ⋯ when hidden.
- [x] Per-sprint group collapse chevrons continue to work; there is no separate section-level collapse left orphaned. <!-- retired useSectionCollapsed + SECTION_KEYS.epicChildren -->
- [x] `DEPRECATED` children stay excluded from the roll-up (unchanged), and the roll-up hides entirely when there are zero non-deprecated children (unchanged).
- [x] The flat (non-grouped) list view still renders correctly under the new toolbar. <!-- removed the section-collapse gate so both views always render -->
- [x] Tests cover: bar segment widths/percentage for a known distribution, tooltip content per segment, metric toggle switching the measured values, status filter still applies, and the hide/show preference round-trips.
- [x] `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` all pass.

## Technical Notes

- Prototype and chosen layout: `src/app/dev/exploration/epic-progress/page.tsx` (variant B, marked "Chosen"). Reuse its `SegBar` (per-segment `Tooltip`) and breakdown logic as the reference.
- Components in play:
  - `src/components/ticket-detail/EpicStatsSummary.tsx` — becomes the slim toolbar (or is replaced by one); keep the `useMemo` roll-up math and the `useLocalStorage` metric.
  - `src/components/ticket-detail/ChildIssueListHeader.tsx` — drop the "Child Issues" title; its menu (view / filter / columns / new) is the basis for the toolbar's ⋯ menu. Avoid duplicating the count.
  - `src/components/ticket-detail/EpicChildrenSection.tsx` — currently renders `EpicStatsSummary` then `ChildIssueListHeader` (around lines 1095-1126); collapse these into the single toolbar. Note the old section-level collapse via `useSectionCollapsed`/`SECTION_KEYS.epicChildren` — decide whether to retire it (no section header left to collapse) and clean up.
  - `src/components/ticket-detail/TicketTabContent.tsx` — mounts the section on the "children" tab with `showStatsSummary`.
- Tooltip: reuse `@/components/shared/Tooltip`. In the prototype each bar segment is a flex item carrying the width with the colored span given an explicit height so it renders inside the inline-flex tooltip wrapper (a percentage-height span collapses to empty). Carry that detail over.
- Status colors come from `STATUS_PILL_COLORS` in `src/components/sprint-board/SprintStatPill.tsx`; keep the bar segments and any breakdown using the same hues so colour ↔ status is consistent with the per-sprint `GroupStatBar`.
- Watch the project's React Compiler lint rules (no setState-in-effect, no ref-access-in-render).
- Confirm exact placement/labels of the moved ⋯ menu actions before finalizing if anything is ambiguous.

## Out of Scope

- Changes to the per-sprint `GroupStatBar` roll-up or the grouping logic.
- The other explored variants (A consolidated header, C quiet strip, D re-earned header) — kept in the exploration for reference only.
- The simpler `EpicProgressBar` on the epics list/timeline view (`src/app/(app)/epics/EpicProgressBar.tsx`).
- Any change to how data is fetched or synced; the roll-up stays derived from the already-loaded children.
