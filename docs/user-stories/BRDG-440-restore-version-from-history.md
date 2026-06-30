# BRDG-440: Restore an old version from History

**Status:** To Do
**Priority:** Medium
**Type:** Feature

## Description
From the version History, the PO wants to easily restore an older version of a
story's content. Today restoring is only reachable through a multi-step Compare
flow; the PO wants a direct "Restore this version" action while previewing a
single version (the view in the screenshot: History tab → version preview with
the version dropdown and Compare button).

Restoring loads the selected version's content back into the editable working
copy (a local draft), so the PO can review it and push to Jira when ready.
Restoring never writes to Jira directly. Because the ticket single view and the
Story Writer render the same History component, the action must work in both.

Decided behaviour (confirmed with PO):
- The Restore action lives **only in the single-version preview** (not on the
  list rows for now).
- Restore loads the version as an editable local draft; the PO pushes to Jira
  separately. It does not auto-push.
- A confirmation is shown **only when an unsaved local draft already exists that
  differs** from the version being restored. Otherwise restore happens directly.

## Current Behaviour
The History tab is rendered by a single shared component used in both views:
- Ticket single view: `src/components/ticket-detail/TicketTabContent.tsx:424`
  mounts `<TicketHistory>` and passes an `onConflictResolved` callback that
  refreshes the content and switches back to the Content tab.
- Story Writer: `src/components/story-writer/panes/apps/HistoryApp.tsx:27`
  mounts `<TicketHistory ticket={writer.ticketData} embedded />` **without**
  `onConflictResolved`, so any restore/revert from inside Story Writer does not
  currently refresh the editor.

`src/components/ticket-detail/TicketHistory.tsx` orchestrates three sub-views:
- `VersionList` (`VersionList.tsx`) — the list of versions; each row opens the
  diff, plus an eye icon opens the preview.
- `VersionPreview` (`VersionPreview.tsx`) — single-version view (the screenshot).
  Header has only a Back arrow, a version dropdown, and a **Compare** button.
  No restore action exists here.
- `DiffViewer` (`DiffViewer.tsx`) — Compare/diff view. It is the **only** place a
  restore exists today: a `Revert to v{X}` button in the footer
  (`DiffViewer.tsx:243`), gated by
  `showRevertActions = !draftInvolved && compareOldVersion && compareNewVersion`
  (`DiffViewer.tsx:119`). So it only appears after the PO opens Compare and picks
  two committed (non-draft) versions.

The revert handler (`TicketHistory.tsx:294`, `handleRevertTo`) calls
`tickets.saveLocalEdit(ticket.key, { field: "description", localValue: version.content })`
(`PUT /api/tickets/[key]/local-edits`), then fires `onConflictResolved?.("keep")`.
It restores the **description** field only (which is the full story body shown in
the preview), via the same local-edits / push-to-Jira path the rest of the app
uses.

Versions are stored in the `storyVersion` table (`src/db/schema.ts:409`), read
via `GET /api/tickets/[key]/versions`; a version's full content is lazy-loaded on
preview/diff open (`TicketHistory.tsx:136`). Synthetic rows are added in the UI
for the local draft (label `draft`) and AI drafts (label `ai-draft`).

## Proposed Approach
Reuse the existing restore mechanism (`handleRevertTo` → `saveLocalEdit` →
`onConflictResolved`); add a new entry point in the preview and make it work in
Story Writer.

1. **Restore button in the preview.** Add a primary "Restore this version" button
   in `VersionPreview` next to the existing **Compare** button
   (`VersionPreview.tsx:60`). New prop `onRestore(version)` (and a `restoring`
   flag for the busy state). Hide/disable it on the active local draft row
   (`version.label === "draft"`) since that is already the working copy.

2. **Wire it through TicketHistory.** Pass `onRestore` to `VersionPreview` from
   `TicketHistory`, reusing `handleRevertTo`'s body (save the version content as a
   `description` local edit, then call `onConflictResolved?.("keep")`). Keep the
   existing diff-view `Revert to v{X}` button as-is.

3. **Confirmation only when a differing unsaved draft exists.** Before restoring,
   check the synthetic local-draft row (the `sorted` entry with `label === "draft"`,
   already available in `TicketHistory.tsx:130`). If it exists and its content
   differs from the version being restored, show a confirm step (reuse the shared
   `Modal`/confirm primitive); otherwise restore directly. If the restored content
   equals the current working content, treat it as a no-op.

4. **Make restore refresh the editor in Story Writer.** `HistoryApp` must pass an
   `onConflictResolved` that reloads the editor's working copy from the local-edits
   draft (via `WriterContext` / `useStoryWriterActions`) so the restored content
   appears in the Story Writer editor, mirroring how `TicketTabContent` refreshes
   the ticket view. Without this, a restore in Story Writer silently does nothing
   visible.

**Out of scope / non-goals:**
- No restore action on the version list rows (PO chose preview-only).
- No auto-push to Jira; restore stays a local draft.
- Restoring title or acceptance-criteria as separate fields — restore covers the
  description (the full story body shown in the preview), consistent with the
  existing revert.
- No new database table, column, or "restored from vX" version record.

## Implementation Plan

Refresh mechanism (the critical unknown): the Story Writer editor renders from
`writer.session.localDraft`, not from local-edits, so `onConflictResolved` alone
will not update it. The editor updates via `writer.onDraftChange(content)`
(`useStoryWriterActions.ts:539` → `updateLocalDraft`, `useStoryWriterDrafts.ts`),
which sets `session.localDraft` in state and persists. So restore needs a new
`onRestored(content)` signal that `HistoryApp` wires to `writer.onDraftChange`.
Confirmation reuses `ConfirmDialog` (`src/components/shared/ConfirmDialog.tsx`).

1. **VersionPreview** (`VersionPreview.tsx`): add props `onRestore(version)` +
   `restoring`. Add a primary "Restore this version" button next to Compare.
   Hide it when `version.label === "draft"`; disable while `restoring` or while
   content is still loading / empty.
2. **TicketHistory** (`TicketHistory.tsx`): add `onRestored?(content)` to props.
   Add `doRestore(version)` = `tickets.saveLocalEdit(key, {field:"description",
   localValue: version.content})`, then `onConflictResolved?.("keep")` and
   `onRestored?.(version.content)`. Add `handleRestore(version)` with the confirm
   gate. Pass `onRestore={handleRestore}` + `restoring={resolving}` to
   VersionPreview. Leave the diff-view `handleRevertTo` path unchanged.
3. **Confirm gate** (`TicketHistory.tsx`): baseline = the synthetic `draft` row
   (`label === "draft"`) if present, else the Jira `current` row. If
   `version.content === baseline.content` → no-op (return). Else if a `draft`
   exists and differs → open `ConfirmDialog`, restore on confirm. Else restore
   directly.
4. **Ticket single view** (`TicketTabContent.tsx`): no change. `doRestore` still
   fires `onConflictResolved("keep")`, which already mutates the ticket and
   switches to the Content tab.
5. **Story Writer** (`HistoryApp.tsx`): pass `onRestored={writer.onDraftChange}`
   to TicketHistory so the editor reflects the restored draft immediately.
6. **Tests**: VersionPreview (button present + calls onRestore; hidden on draft),
   TicketHistory (direct vs confirm path; saveLocalEdit payload), HistoryApp
   (passes onRestored wired to onDraftChange).

## Acceptance Criteria
- [x] The single-version preview shows a "Restore this version" action next to Compare. <!-- VersionPreview.tsx header -->
- [x] Restoring loads the version's content into the editable local draft via the existing local-edits path (does not write to Jira). <!-- TicketHistory.tsx doRestore -> tickets.saveLocalEdit -->
- [x] After restoring in the ticket single view, the content view shows the restored draft (switches to Content tab). <!-- TicketTabContent.tsx:430 onConflictResolved (unchanged) -->
- [ ] After restoring in Story Writer, the editor shows the restored draft. <!-- HistoryApp.tsx passes onRestored={writer.onDraftChange} -->
- [x] A confirmation is shown only when an unsaved local draft exists that differs from the version being restored; otherwise restore happens directly. <!-- TicketHistory.tsx handleRestore, compares the label==="draft" row -->
- [x] The Restore action is hidden/disabled on the active local-draft version (it is already the working copy). <!-- VersionPreview.tsx, version.label === "draft" -->
- [x] The existing Compare-view "Revert to v{X}" button still works unchanged. <!-- DiffViewer.tsx:243, handleRevertTo left intact -->

## Tests
- [x] Preview renders the Restore button and clicking it calls saveLocalEdit with the version's content. <!-- src/components/ticket-detail/VersionPreview.test.tsx -->
- [x] TicketHistory restore: direct restore when no differing draft; confirm step when a differing draft exists. <!-- src/components/ticket-detail/TicketHistory.test.tsx -->
- [x] Restore is hidden/disabled on the local-draft version. <!-- VersionPreview.test.tsx -->
- [ ] HistoryApp passes an onRestored that triggers an editor refresh in Story Writer. <!-- src/components/story-writer/panes/apps/HistoryApp.test.tsx (new) -->

## Related
- Builds on the existing Compare/diff `Revert to v{X}` flow (`DiffViewer.tsx`, `TicketHistory.handleRevertTo`).
- Uses the local-edits + push-to-Jira path documented in `docs/architecture/optimistic-updates.md`.
- Shared History component used by both ticket detail (`TicketTabContent.tsx`) and Story Writer (`HistoryApp.tsx`).
