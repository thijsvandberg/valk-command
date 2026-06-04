# BRDG-283: Scan Backlog Interface

**Status:** Planned
**Priority:** Medium
**Type:** Feature
**Epic:** [Backlog Deprecation Review](../plans/2026-06-04-backlog-deprecation-review-epic.md)

## Description

The control center for the Backlog Deprecation Review epic: a dedicated view that lists every
scan-eligible backlog ticket with its **scan state and multi-topic scores**, so the PO can see at a
glance what has been scanned, when, and how likely each ticket is obsolete. Read-only over the data
produced by BRDG-282 (and later the deep-dive topics). Selection/run controls (BRDG-284) and the
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

Per PO discussion, this can be built **UI-early against the BRDG-282 schema** (even before the full
staleness data is populated) so the screen can be steered sooner, or backend-first so it shows real
scored data on day one. Decide at kickoff.

## Testing

- List renders rows from scan data; columns map to the right fields.
- Sort + filter logic (oldest-first, threshold, disposition).
- Empty + loading states.

## Checklist

- [ ] Invoke the `frontend-design` skill before any frontend work
- [ ] New `/cleanup` view in the app navigation
- [ ] Ticket list: key/title, status, `lastScannedAt`, per-topic score columns, overall, disposition
- [ ] Sort (overall, staleness, last-scanned, key) + filter (scanned state, disposition, threshold, backlog)
- [ ] Row opens the ticket via the existing `SidePanel` overlay
- [ ] Empty + loading states (reuse the `loading.tsx` pattern)
- [ ] Tests (rendering, sort/filter, states)
- [ ] Run `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`
- [ ] Document the view in `docs/architecture/` and reference the epic
