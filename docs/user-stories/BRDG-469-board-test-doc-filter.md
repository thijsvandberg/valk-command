# BRDG-469: Filter the board on test-doc state and show per-group doc coverage

**Status:** To Do
**Priority:** Medium
**Type:** Feature

## Description

There is no way to answer "which tickets still miss a test doc?" or "which drafts are waiting for my review?" other than visually scanning the board markers (which are even hidden by default). The PO wants to isolate test-doc work the same way other board filters isolate readiness or gaps.

Decided behaviour:

- The board filter bar gets a "Test doc" filter with the four states: Missing (no doc), Draft, Accepted, Not needed.
- The filter persists like the other board filters and works on every board view.
- Group headers show a compact doc-coverage stat when the "Test documentation" field toggle is on, so a sprint's delivery readiness is visible at a glance.

## Current Behaviour

- Ticket rows already carry `testDocState` in the list payload (`"accepted" | "draft" | "not_needed" | null` via `deriveTestDocState`), so no payload change is needed.
- The filter bar model lives in `src/components/sprint-board/filter-bar-types.ts` with filtering applied in the board's filter pipeline; filters persist per the filter-persistence architecture doc.
- `testDocState` participates in the pending-edits overlay (`pendingTicketEdits.ts`); a just-generated draft or a just-set marker is overlaid on possibly-stale list data. Filtering must evaluate the effective (overlaid) state, at the same point in the pipeline where other overlaid fields are filtered.
- `GroupStatBar.tsx` renders per-group aggregates (points etc.); it has no test-doc awareness. The "Test documentation" field toggle (`BoardFieldToggle.tsx`, inline tag id `testDoc`) is per-sprint and disabled on the "All" view.

## Proposed Approach

1. **Filter.** Add a "Test doc" filter to the filter bar following the existing multi-select filter pattern in `filter-bar-types.ts` (options: Missing, Draft, Accepted, Not needed). Missing means effective state `null`. Persist it exactly like sibling filters. The filter is data-based and available on all views, independent of the per-sprint marker toggle.
2. **Coverage stat.** In `GroupStatBar.tsx`, when the group's sprint has the `testDoc` field toggle enabled, show "N/M docs" where M = non-subtask tickets in the group minus those marked not needed, and N = accepted docs. A tooltip breaks down accepted / draft / missing / not needed. Hidden when the toggle is off (no clutter), consistent with the marker's per-sprint visibility scope.
3. **Overlay correctness.** Compute both the filter predicate and the coverage stat from the overlaid ticket list, not the raw SWR data.

**Non-goals:**
- No changes to marker visuals or the review/bundle flows.
- No saved-view presets beyond what the existing filter persistence already provides.
- No coverage stat on the "All" view (the toggle is per-sprint by design).

## Acceptance Criteria

- [ ] The filter bar offers a "Test doc" filter with Missing / Draft / Accepted / Not needed; selecting values filters the rows accordingly on every view.
- [ ] The filter persists across reloads like the other board filters, and is included in the existing clear-filters affordance.
- [ ] Filtering respects in-flight optimistic state: a ticket whose doc was just generated moves between filter buckets without a refresh.
- [ ] Group headers show an accurate "N/M docs" coverage stat with a breakdown tooltip when the sprint's "Test documentation" field toggle is on, and nothing when it is off.
- [ ] Subtasks and not-needed tickets do not count toward the coverage denominator.
- [ ] Relevant docs updated (filter-persistence and/or workspace-integration sections).

## Tests

- [ ] Filter predicate unit tests: each state option, combinations, effective-state via pending-edits overlay.
- [ ] Filter bar renders the new filter, persists selection, and clear-filters resets it.
- [ ] GroupStatBar: counts (denominator excludes subtasks + not needed), tooltip breakdown, hidden when the toggle is off.

## Related

- [[BRDG-468-ticket-detail-test-doc-controls]] — same feature wave; independent code surface.
- `docs/architecture/filter-persistence.md`, `docs/architecture/optimistic-updates.md`.
