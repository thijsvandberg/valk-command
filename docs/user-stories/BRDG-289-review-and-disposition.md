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

## Checklist

- [ ] Invoke the `frontend-design` skill before any frontend work
- [ ] Per-ticket score breakdown panel (per-topic score + evidence + rationale + links)
- [ ] Confirm action sets `disposition="confirmed"` (local only, no Jira write)
- [ ] Dismiss (snooze) sets `disposition="dismissed"` + `dispositionUntil`; optional note
- [ ] Bulk confirm/dismiss from the scan backlog view
- [ ] Notifications on new candidates + activity-log entries on actions
- [ ] Tests (state transitions, cooldown, breakdown render, notifications)
- [ ] Run `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`
- [ ] Update docs and reference the epic
