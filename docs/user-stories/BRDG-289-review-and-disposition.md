# BRDG-289: Review & Disposition

**Status:** Planned
**Priority:** Medium
**Type:** Feature
**Epic:** [Backlog Deprecation Review](../plans/2026-06-04-backlog-deprecation-review-epic.md)

## Description

Closes the loop: lets the PO **review** each candidate with its full multi-topic score breakdown and
assembled rationale, then **dispose** of it — Confirm (this can go) or Dismiss (false positive, snooze).
This is the human-in-the-loop step the whole epic exists to serve. Nothing is written to Jira; what the
PO does in Jira after confirming is manual (or a later story).

## Requirements

- Per-ticket **score breakdown** panel: each topic's score + its evidence + the assembled
  `scanRationale`, with the superseded-by link (BRDG-286) and already-built evidence (BRDG-287) clickable.
- **Confirm** action: sets `disposition="confirmed"` (a local marker that the PO judged it removable).
  No Jira write. Confirmed items move to a "confirmed" filter/section.
- **Dismiss (snooze)** action: sets `disposition="dismissed"` + `dispositionUntil` cooldown so it is not
  re-queued or re-surfaced until the cooldown passes; optional dismiss note.
- **Notifications + activity log**: notify when new candidates appear; log confirm/dismiss actions.
- Bulk confirm/dismiss from the scan backlog view for efficiency.

## Testing

- Confirm/dismiss set the right local state; no Jira write path touched.
- Dismiss cooldown prevents re-queue/re-surface until expiry.
- Breakdown renders all topic scores + evidence + links.
- Notification + activity-log entries created.

## Implementation Plan

- **Data**: add `ticket_metadata.disposition_note` (migration `0067_mean_mother_askani.sql`) for the
  optional dismiss/confirm note — the lighter option vs folding into `scanScores`.
- **Transition logic** (`src/lib/cleanup-disposition.ts`, pure/testable): confirm/dismiss/reset
  field-set; dismiss cooldown = `DISMISS_COOLDOWN_DAYS` (default **90 days**).
- **Service** (`src/lib/cleanup-disposition-service.ts`): upserts `ticketMetadata` only (no Jira
  client imported), writes one `deprecation-scan` activity-log entry per batch.
- **APIs**: `GET/POST /api/cleanup/[key]/disposition` (breakdown + single action) and
  `POST /api/cleanup/disposition` (bulk).
- **UI**: row click opens `DispositionPanel` drawer (per-topic score + evidence + rationale;
  `supersededBy` clickable, re-targets the drawer; `implementedIn` as evidence text); drawer
  escalates to the full `SidePanel`. Bulk Confirm/Dismiss on the existing multi-select bar.
- **Notification**: `runDeprecationDeepScan` fires `deprecation-candidate` when `becameCandidate`.

## Checklist

- [x] Invoke the `frontend-design` skill before any frontend work
- [x] Per-ticket score breakdown panel (per-topic score + evidence + rationale + links)
- [x] Confirm action sets `disposition="confirmed"` (local only, no Jira write)
- [x] Dismiss (snooze) sets `disposition="dismissed"` + `dispositionUntil`; optional note
- [x] Bulk confirm/dismiss from the scan backlog view
- [x] Notifications on new candidates + activity-log entries on actions
- [x] Tests (state transitions, cooldown, breakdown render, notifications)
- [x] Run `npm run lint`, `npm run typecheck`, `npm run test` <!-- skipped: npm run build (orchestrator instruction: do not run build) -->
- [x] Update docs and reference the epic
