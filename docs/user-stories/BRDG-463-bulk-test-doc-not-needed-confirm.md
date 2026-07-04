# BRDG-463: Confirm before regenerating test docs for tickets marked "no test doc needed"

**Status:** To Do
**Priority:** Medium
**Type:** Feature

## Description

When the PO triggers a bulk generate/regenerate of test docs and the selection contains one or more tickets that were previously marked as **"no test doc needed"**, show a confirmation modal first. The modal lets the PO choose whether to include those tickets in the run or leave them alone.

Bulk "generate" already means bulk "regenerate": if a ticket already has a test doc, running generate on it produces a fresh draft. That behaviour stays as-is. The new guard is **only** about tickets marked "no test doc needed" — it prevents silently undoing a deliberate "this ticket doesn't need docs" decision by sweeping those tickets into a bulk run.

Decided behaviour (confirmed with PO):
- The modal appears for **any** (re)generate queue that contains at least one "not needed" ticket, including a single-ticket run (e.g. from the row context menu). It is not limited to 2+ selections.
- The **primary/default** button skips the "not needed" tickets and regenerates only the rest. Including them is the **secondary** action. This defaults to honouring the earlier "not needed" decision.
- Tickets already carrying an accepted doc get **no** separate warning; regenerating them is expected bulk behaviour.

## Current Behaviour

Every bulk generate/regenerate entry point funnels through a single helper:

- `openTestDocQueue(keys, opts?)` in `src/components/sprint-board/useTestDocBoard.ts:127`. It already silently drops `DEPRECATED` tickets, then calls `setTestDocQueue({ keys, autoGenerate, returnToSprintId })`, which opens `TestDocReviewModal` (`src/components/sprint-board/TestDocReviewModal.tsx`) and starts generating.

Callers of `openTestDocQueue` (all in `src/components/sprint-board/SprintBoard.tsx`):
- **Bulk Action Bar → "Generate test docs"** — `onGenerateTestDocs={() => openTestDocQueue([...checkedTickets])}` (`SprintBoard.tsx:1167`, wired from `BulkActionBar.tsx:347`). Passes every checked ticket regardless of state.
- **Row context menu → "Generate test doc"** — `openTestDocQueue([...rowMenu.targets])` (`SprintBoard.tsx:1270`). Can be one or many tickets.
- **Sprint bundle → "Generate missing"** — `openTestDocQueue(keys, { returnToSprintId })` (`SprintBoard.tsx:1304`). The `missing` bucket already excludes "not needed" tickets (`src/app/api/sprints/[id]/test-docs/route.ts`), so this path is effectively already safe.
- **Status-line "View"** — `openTestDocQueue([key], { autoGenerate: false })` (`SprintBoard.tsx:1309`). View-only, no generation.

How "no test doc needed" is represented:
- Client rows carry `ticket.testDocState: "accepted" | "draft" | "not_needed" | null` (`src/db/schema.ts:278`; used on the board at `BoardRow.tsx:803`). No extra fetch is needed to detect the state.
- Persisted as `testDocClassification = "not_stakeholder_relevant"` with `testDoc` cleared, set via `PUT /api/tickets/[key]/test-doc` with `{ notNeeded: true }` (`src/app/api/tickets/[key]/test-doc/route.ts`).
- The status-line "Generate" button only renders when `testDocState == null` (`StatusChangeLine.tsx:249`), so a "not needed" ticket never reaches generation through that affordance — the bulk paths above are the only way in.

Today, when a bulk run includes "not needed" tickets, they are queued and regenerated with no prompt. The only signal is the review modal opening for a ticket the PO had already decided didn't need docs.

## Proposed Approach

Add the guard **inside `openTestDocQueue`** (`useTestDocBoard.ts:127`) — the single funnel — so every current and future caller is covered without touching each call site.

1. After the existing `DEPRECATED` filter produces `eligible`, partition it:
   - `notNeeded = eligible.filter(k => allTickets.find(t => t.key === k)?.testDocState === "not_needed")`
   - `rest = eligible` minus `notNeeded`
2. If `notNeeded.length === 0` **or** `opts.autoGenerate === false` (view-only), keep today's behaviour: `setTestDocQueue` immediately.
3. Otherwise, open a confirmation modal instead of queueing:
   - Copy: "N ticket(s) are marked 'no test doc needed'. Regenerating will produce new drafts for them." List the keys.
   - **Primary (default): "Skip and regenerate the rest"** → `setTestDocQueue({ keys: rest, ... })`. If `rest` is empty, close the modal and toast (e.g. "Nothing to regenerate"), matching the existing deprecated-only empty-queue toast.
   - **Secondary: "Include them (N)"** → `setTestDocQueue({ keys: eligible, ... })`.
   - **Cancel** → close, queue nothing.

Reuse the shared confirm primitive: `src/components/shared/ConfirmDialog.tsx` (`open/onClose/title/description/confirmLabel/confirmVariant/onConfirm` plus `extraActions` for the secondary "Include them" button). Follow the Modal/z-token conventions in `docs/architecture/ui-primitives.md` — do not hand-roll a new overlay.

State for the pending confirmation lives in `useTestDocBoard.ts` alongside `testDocQueue` (a small `pendingTestDocConfirm` object holding `eligible`, `notNeeded`, `rest`, and `opts`), rendered from `SprintBoard.tsx` next to the existing `TestDocReviewModal`.

Non-goals / out of scope:
- No separate warning for tickets that merely already have an accepted doc — regenerating those is expected.
- The "not needed" classification is **not** auto-cleared when the PO chooses "Include them". The regenerate just produces a draft; the classification only changes if the PO later saves/accepts a doc in the review modal (existing behaviour).
- The sprint-bundle "Generate missing" path is unaffected in practice (its `missing` bucket already excludes "not needed"), but routing it through the same guarded helper keeps it correct if that bucket logic ever changes.

## Implementation Plan

1. **Guard logic + state** — `src/components/sprint-board/useTestDocBoard.ts`: partition `eligible`, add `pendingTestDocConfirm` state, branch in `openTestDocQueue`, expose `pendingTestDocConfirm` + resolvers (`confirmSkip`, `confirmInclude`, `cancelConfirm`).
2. **Modal render** — `src/components/sprint-board/SprintBoard.tsx`: render `ConfirmDialog` (or a thin wrapper) driven by `pendingTestDocConfirm`, next to `TestDocReviewModal`.
3. **Tests** — see below.

## Acceptance Criteria

- [ ] Triggering a bulk (re)generate whose selection includes ≥1 "not needed" ticket opens a confirmation modal before any generation starts. <!-- openTestDocQueue guard, useTestDocBoard.ts:127 -->
- [ ] The modal's default/primary button skips the "not needed" tickets and regenerates only the rest. <!-- ConfirmDialog onConfirm -> setTestDocQueue({ keys: rest }) -->
- [ ] A secondary button includes the "not needed" tickets and regenerates the full eligible set. <!-- ConfirmDialog extraActions -> setTestDocQueue({ keys: eligible }) -->
- [ ] Cancel closes the modal and queues nothing. <!-- cancelConfirm -->
- [ ] The guard fires for a single "not needed" ticket too (e.g. row context menu), not only for 2+ selections. <!-- partition runs regardless of eligible.length -->
- [ ] A selection with no "not needed" tickets behaves exactly as today (queues immediately, no modal). <!-- notNeeded.length === 0 short-circuit -->
- [ ] View-only opens (`autoGenerate: false`) never show the modal. <!-- opts.autoGenerate === false short-circuit -->
- [ ] Choosing "Skip" when every eligible ticket is "not needed" queues nothing and shows a toast instead of an empty review modal. <!-- rest.length === 0 branch -->
- [ ] The modal names how many tickets are affected and lists their keys. <!-- ConfirmDialog description -->

## Tests

- [ ] `openTestDocQueue` opens the confirm modal (does not call `setTestDocQueue`) when the queue contains a "not needed" ticket; "Skip" queues only `rest`; "Include" queues all eligible; "Cancel" queues nothing. <!-- src/components/sprint-board/useTestDocBoard.test.ts (new) -->
- [ ] No modal and immediate queue when selection has zero "not needed" tickets. <!-- useTestDocBoard.test.ts -->
- [ ] No modal for `autoGenerate: false`. <!-- useTestDocBoard.test.ts -->
- [ ] Single "not needed" ticket still triggers the modal. <!-- useTestDocBoard.test.ts -->
- [ ] "Skip" with an all-"not needed" selection queues nothing and toasts. <!-- useTestDocBoard.test.ts -->

## Related
- [[BRDG-461-test-doc-refactor]] — same test-doc UI area; recently refactored components (TestDocReviewModal/Pane/StoryPane).
- `src/components/shared/ConfirmDialog.tsx` — shared confirm primitive to reuse.
- `docs/architecture/ui-primitives.md` — Modal nesting + z-token rules for the overlay.
- `docs/architecture/workspace-integration.md` — how the review queue drives VRW `generate-test-doc`.
