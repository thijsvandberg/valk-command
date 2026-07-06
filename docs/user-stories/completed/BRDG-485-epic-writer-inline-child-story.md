# BRDG-485: Work out a child story in-place in the Epic Writer

**Status:** Done
**Priority:** Medium

## Description

As the PO, once the Epic Writer has produced a breakdown and I have created a child
story in Jira, I want to keep working that story out **without leaving the Epic
Writer** - edit its description and refine it with the AI in-place, then push it back
to Jira. Today the only per-card action is "Deepen/Refine", which just sends another
turn in the *epic* chat; there is no way to open the child story's own writer from the
breakdown.

Follow-up to [BRDG-484](BRDG-484-epic-writer-layout-navigation.md) (which added the
resizable split + content views) and the breakdown flow in
[BRDG-479](BRDG-479-epic-writer-advance-to-breakdown.md). Related epic:
[BRDG-291](BRDG-291-epic-writer.md).

## Decision (chosen with the PO)

In-place, not navigate-away: the child story opens as an extra content view inside the
Epic Writer's right region (via the Apps dropdown), reusing the existing Story Writer
building blocks (`StoryWriterChat` + `RichEditor`, both prop-driven) rather than a
bespoke lookalike. MVP scope: **one child open at a time**, and **editor + refine chat**
(not the full pane apps - diff/meta/split - which can come later).

## Tasks

- [x] Make the epic's own **Draft** view editable (not just a read-only preview): the
      Draft content view now embeds the shared `RichEditor` bound to the epic's
      `localDraft`, so the PO can edit the epic description in-place (Save/Push in the
      header persist it). This supersedes BRDG-484's read-only `StoryPreviewApp` in the
      Epic Writer (the now-unused epic pane providers + `useEpicWriterContext` were
      removed).
- [x] Add an "Open" action to a **created** breakdown card (has a Jira key) that opens
      that child story in-place. DRAFT cards must be created in Jira first (their
      existing "Create in Jira" flow is unchanged).
- [x] The open child story appears as a third view in the Epic Writer's Apps dropdown
      (alongside Breakdown / Draft), and can be closed again.
- [x] The child view runs its own `useStoryWriter(childKey)` in normal story mode
      (`/tickets/{key}/…` routes, fully separate from the epic session) and shows the
      child's description in a `RichEditor` + a `StoryWriterChat` to refine it, with the
      AI's inline draft-accept loop.
- [x] Save draft / Push to Jira in the child view target the **child** ticket, with the
      same visible feedback as the epic header (toast + saved state).
- [x] Only one child session is mounted at a time (switching to Breakdown/Draft or
      closing the child unmounts it; the session resumes from the server on reopen).

## Out of Scope

- Multiple child stories open at once.
- The full pane-app set for the child (diff / meta / split / related) - editor + chat only.
- Any change to the epic session, the breakdown dispatch (BRDG-479), or the BRDG-484 layout.

## Acceptance Criteria

- [x] From a created breakdown card, the PO can open that child story in-place and see
      its description + a refine chat, without leaving the Epic Writer.
- [x] Editing + refining + pushing in the child view affect the child ticket only.
- [x] The child view is reachable/closable via the Apps dropdown; one at a time.
- [x] New/changed behaviour is covered by tests; `npm run lint`, `npm run typecheck`,
      `npm run test` and `npm run build` pass.
