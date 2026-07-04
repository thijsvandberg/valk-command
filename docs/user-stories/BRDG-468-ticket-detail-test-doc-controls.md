# BRDG-468: Always-visible test-doc row with quick actions on the ticket detail view

**Status:** To Do
**Priority:** High
**Type:** Feature

## Description

The test documentation feature is fully controllable from the sprint board (marker, review popup, bulk flow, sprint bundle), but on the single ticket view it is nearly invisible. The "Test doc" meta row only renders when a state already exists; a ticket that still needs a doc (the case that needs attention most) shows nothing at all. There are also no quick actions: generating, regenerating, or toggling the "not needed" marker always requires going back to the board or digging into the popup.

Decided behaviour:

- The "Test doc" meta row is always visible for tickets that can carry a test doc (not subtasks, not epics), including a neutral "No doc yet" state.
- The row offers quick actions appropriate to the state: generate, open/review, regenerate, mark not needed, and remove the not-needed marker.
- State changes made from the row reflect immediately on the detail view and the board (no hard refresh), following the optimistic-updates rules.

## Current Behaviour

- `src/components/ticket-detail/TicketMetaContent.tsx:525-559`: the "Test doc" `DetailRow` renders only when `ticket.testDocState != null`, showing Saved (green) / Draft pending review (amber) / Not needed (muted). Clicking it opens the locally hosted `TestDocReviewModal` with `autoGenerate: false`. Tickets without any state show no row.
- The review popup (BRDG-467) already supports every transition: generate, regenerate (with `TestDocRegenerateConfirm` semantics), save, mark not needed, remove the not-needed marker. `PUT /api/tickets/[key]/test-doc` handles `{ notNeeded: true | false }`.
- `useTestDocReview.ts` contains the canonical client-side refresh choreography for these transitions (pending-edit overlay on `testDocState`, `patchTicketDetailCache`, `invalidateTestDocCache`, view revalidation). Any row-level action must reuse that choreography, not reinvent it.
- **In-flight precondition:** a parallel session has uncommitted work adding "Generate/View test doc" items to the detail page more-menu and the board SidePanel more-menu (plus sprint-bundle polish). This story builds on top of that work and must only start once it is committed. If it lands in a different shape, adapt this story's overlap accordingly instead of duplicating menu items.

## Proposed Approach

1. **Always render the row.** In `TicketMetaContent.tsx`, drop the `testDocState != null` guard for tickets where `type !== "subtask"` and not an epic. Add a fourth, muted "No doc yet" presentation for `null` state (faint `FileCheck2`, matching the board marker's none state).
2. **Quick actions per state**, compact and consistent with the meta sidebar's visual language (ui-primitives doc; reuse `AnchoredPanel`/`MenuList` or small icon buttons with full hover/focus-visible/active states):
   - `null`: Generate (opens the local review modal with `autoGenerate: true`), Mark not needed (direct `PUT { notNeeded: true }`).
   - `not_needed`: Remove marker (direct `PUT { notNeeded: false }`), Open (review modal; per BRDG-467 it shows the marked state and never auto-generates).
   - `draft` / `accepted`: Open (existing behaviour), Regenerate (routes through the same confirm-and-versions flow as the popup; opening the modal with a regenerate intent is acceptable).
3. **Refresh choreography.** Direct `PUT` actions from the row must apply the same pending-edit overlay + detail-cache patch + test-doc cache invalidation as the popup handlers. Extract or reuse the existing helpers from `useTestDocReview.ts` / `src/lib` rather than duplicating the sequence.
4. **Bundle pill fetch check (post-merge polish of the in-flight wave).** The in-flight `TestDocTicketPill` in `SprintTestDocsModal.tsx` fetches the full ticket detail per row on mount. Verify this against `docs/architecture/client-data-and-memory.md` (list-vs-detail payload split); if `TicketRefPill` fetches lazily (on hover), align with that pattern so a 50-row bundle does not fire 50 detail fetches up front.

**Non-goals:**
- No changes to the review popup itself.
- No test-doc surfaces in Inbox, Epics, Refinement, or the Stakeholder view (explicitly declined).
- No new API endpoints; everything uses the existing routes.

## Acceptance Criteria

- [ ] The "Test doc" row is always visible on the ticket detail meta sidebar for non-subtask, non-epic tickets, including a muted "No doc yet" state when no doc, draft, or marker exists.
- [ ] From the row, a ticket without a doc can be generated (opens the review modal, auto-generating) or marked not needed, without opening the board.
- [ ] From the row, a not-needed ticket shows its marker and offers removing it; removal returns the row to "No doc yet" without generating anything.
- [ ] From the row, a ticket with a draft or accepted doc can be opened and regenerated; regeneration goes through the same confirm/versions flow as the popup.
- [ ] Row actions update the detail view and the board marker without a hard refresh (pending-edit overlay + cache patches, per the optimistic-updates doc).
- [ ] Subtasks and epics show no test-doc row.
- [ ] The in-flight bundle hover pills do not eagerly fetch full ticket detail for every visible row (aligned with client-data-and-memory rules).
- [ ] `docs/architecture/workspace-integration.md` (stakeholder test documentation section) documents the detail-view surface.

## Tests

- [ ] TicketMetaContent: renders all four states incl. "No doc yet"; hides the row for subtasks/epics.
- [ ] Quick actions: generate opens the modal with autoGenerate; mark/remove not-needed call the PUT route and apply the overlay + cache patch; failure clears the pending edit.
- [ ] Regenerate from the row lands in the popup's confirm/versions flow.

## Related

- [[BRDG-467-test-doc-popup-not-needed-visibility]] — popup-side visibility and unset action this story extends to the detail view.
- [[BRDG-426-generate-test-doc]] / [[BRDG-461-sprint-test-doc-delivery]] — the underlying feature.
- `docs/architecture/optimistic-updates.md`, `docs/architecture/client-data-and-memory.md`, `docs/architecture/ui-primitives.md`.
