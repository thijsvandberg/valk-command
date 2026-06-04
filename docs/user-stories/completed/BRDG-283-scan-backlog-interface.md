# BRDG-283: Scan Backlog Interface

**Status:** Done
**Priority:** Medium
**Type:** Feature
**Epic:** [Backlog Deprecation Review](../plans/2026-06-04-backlog-deprecation-review-epic.md)

## Description

The control center for the Backlog Deprecation Review epic: a dedicated view that lists every
scan-eligible backlog ticket with its **scan state and multi-topic scores**, so the PO can see at a
glance what has been scanned, when, and how likely each ticket is obsolete. Read-only over the data
produced by BRDG-297 (and later the deep-dive topics). Selection/run controls (BRDG-284) and the
disposition actions (BRDG-289) plug into this screen later.

## Scope

- **In:** a new route/view; the ticket list with last-scan time, per-topic score columns, overall
  score, disposition badge; sort + filter; empty/loading states.
- **Out:** deep-dive selection + run controls (BRDG-284), confirm/dismiss actions (BRDG-289), keyword
  list editor (BRDG-285), the AI topic scores themselves (only the columns/placeholders exist until
  those stories land).

## Requirements

- New view (e.g. `/cleanup`) reachable from the app navigation.
- Lists scan-eligible tickets from both backlogs with columns: key + title, status, `lastScannedAt`
  (relative + absolute on hover), a column per scoring topic (staleness now; others show "—" until
  their story ships), an overall score, and a disposition badge.
- **Sort** by overall score, by staleness, by `lastScannedAt` (oldest/newest), by key.
- **Filter** by: scanned/never-scanned, disposition, score threshold, backlog.
- Row click opens the ticket (reuse the existing `SidePanel` overlay pattern, per BRDG-281/275).
- Clear empty state ("nothing scanned yet — Tier-1 runs in the background") and loading skeleton
  (follow the existing `loading.tsx` pattern used by other app routes).
- Visual scoring treatment (score bars/heat) follows the project's custom design tokens — invoke the
  `frontend-design` skill before any JSX/styling.

## Sequencing note

Per PO discussion, this can be built **UI-early against the BRDG-297 schema** (even before the full
staleness data is populated) so the screen can be steered sooner, or backend-first so it shows real
scored data on day one. Decide at kickoff.

## Testing

- List renders rows from scan data; columns map to the right fields.
- Sort + filter logic (oldest-first, threshold, disposition).
- Empty + loading states.

## Implementation Plan

Built UI-early on the BRDG-297 schema (real Tier-1 staleness data flows through, other
topics render as placeholders).

- **API** `GET /api/cleanup`: joins scan-eligible backlog tickets (`sprintName === "" AND
  removedFromJiraAt IS NULL`, the same definition the Tier-1 scanner uses) with their
  `ticketMetadata` scan fields. Parses `scanScores` JSON into a per-topic map. Server-side
  sort + filter via query params; returns a typed row array plus a `topics` descriptor and
  `total`. Later stories add columns/actions to this same route.
- **View** `/cleanup` (`src/app/(app)/cleanup/page.tsx`): a table of every eligible ticket
  with key+title, status, last-scanned (relative, absolute on hover), a column per scoring
  topic (staleness live; others "—"), an overall heat bar, and a disposition badge. Sort +
  filter controls drive the API query. Pure sort/filter helpers live in `cleanup-utils.ts`
  for unit testing. Score heat uses the brand→amber→error token ramp.
- **SidePanel reuse**: row click sets `selectedKey`; the panel mounts exactly as the sprint
  board does (`SidePanel` with `onSelectTicket`, `adjacentKeys`, `saveTicketMetadata`
  wiring), built from the loaded row so it opens instantly.
- **Nav**: a "Cleanup" entry in `src/components/Sidebar.tsx`.
- **Empty + loading**: empty state copy plus `loading.tsx` skeleton mirroring `pipelines`.

## Checklist

- [x] Invoke the `frontend-design` skill before any frontend work
- [x] New `/cleanup` view in the app navigation
- [x] Ticket list: key/title, status, `lastScannedAt`, per-topic score columns, overall, disposition
- [x] Sort (overall, staleness, last-scanned, key) + filter (scanned state, disposition, threshold) <!-- skipped: "backlog" sub-filter — the scan-eligible set is the backlog by definition (sprintName=="" AND not removed), so there is no second backlog to switch between yet; revisit if BT vs regular backlog separation is needed -->
- [x] Row opens the ticket via the existing `SidePanel` overlay
- [x] Empty + loading states (reuse the `loading.tsx` pattern)
- [x] Tests (rendering, sort/filter, states)
- [x] Run `npm run lint`, `npm run typecheck`, `npm run test` (build skipped per task instructions — do NOT run `npm run build`)
- [x] Document the view in `docs/architecture/` and reference the epic

## Post-implementation refinement (2026-06-05)

**Subtask exclusion** (Backlog Deprecation Review epic): Added `EXCLUDED_SCAN_TYPES` constant and
`isScannableType` helper in `src/lib/ticket-status.ts`. Applied `or(isNull(ticket.type), notInArray(ticket.type, EXCLUDED_SCAN_TYPES))` at all four eligibility query sites:
`runDeprecationStalenessScan` and `runAutoEnqueue` in `src/lib/scheduled-tasks.ts`,
`loadEligible()` in `src/app/api/cleanup/deep-scan/route.ts`, and the GET handler in
`src/app/api/cleanup/route.ts`. Subtasks (stored as `"subtask"` after `normalizeIssueType`) are
cleaned up with their parent and must never appear as their own row in the cleanup overview.
Null-type tickets are retained (the `or(isNull)` guard prevents SQLite NULL semantics from
accidentally dropping unknown types). Tests updated at all four sites.
