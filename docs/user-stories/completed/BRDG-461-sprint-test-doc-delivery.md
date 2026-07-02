# BRDG-461: Sprint test documentation delivery (bundle, export, missing overview)

**Status:** To Do
**Priority:** Medium
**Type:** Feature

## Description

Follow-up to [[BRDG-426-generate-test-doc]]. Per-story test docs are now generated,
validated, and stored (Bridge `ticket_metadata.test_doc` + Jira expand block). This story
adds the **sprint-level deliverable**: one modal per sprint that bundles all stored
test-doc blocks in the style of the manual "BT: 139" documents, offers **one-click
copy** of the whole document, and shows **which stories still miss a doc** before the
sprint can be delivered — with a direct "generate missing" hand-off into the BRDG-426
validation queue.

The BT: 139 calibration showed the manual process missed five guest-visible stories;
the missing overview is the safeguard against exactly that.

## Current Behaviour

- `ticket_metadata` has `test_doc`, `test_doc_updated_at`, `test_doc_classification`
  (`ok` | `needs_input` | `not_stakeholder_relevant`) per BRDG-426.
- The sprint group header "..." menu is `SprintDetailsPopover`
  (`src/components/sprint-board/SprintDetailsPopover.tsx`), fed by `GroupStatBar.tsx`
  (board groups) and `SprintBoardHeader.tsx` (single-sprint view). Actions arrive as
  optional `on*` callbacks drilled from `SprintBoard.tsx`.
- `TestDocReviewModal` (BRDG-426) accepts a `keys: string[]` queue — reusable as-is for
  "generate missing".
- `ticket_sprint` joins tickets to sprints; `sprint_name_cache` maps sprint id → display
  name (e.g. "BT: 143").

## Proposed Approach

1. **Route** `GET /api/sprints/[sprintId]/test-docs`: all non-subtask tickets in the
   sprint (via `ticket_sprint`, excluding `removed_from_jira_at`), left-joined with
   `ticket_metadata`. Returns `{ sprintName, documented, internal, missing, other }`:
   - `documented`: classification `ok` (or `needs_input`, flagged) docs, ordered story
     points desc (proxy for "big features first", like the manual docs), then key.
   - `internal`: `not_stakeholder_relevant` one-liners (the "Misc" tail).
   - `missing`: DONE/TEST tickets without a doc — the delivery gap list.
   - `other`: remaining statuses without a doc (informational, not blocking).
2. **Bundle modal** `SprintTestDocsModal.tsx`: header "Test documentation — {sprintName}";
   body renders the documented blocks (via `renderMarkdown`) with a small key chip per
   block, then a "Misc / internal" section, then the missing list (amber) with a
   **Generate missing (N)** button; footer **Copy document** (writes markdown to the
   clipboard: blocks joined by blank lines, internal one-liners under a `**Misc**`
   header, no per-ticket keys — the deliverable is stakeholder-facing) + Close.
3. **Entry point**: "Test documentation" action in `SprintDetailsPopover` (sprint kind
   only), drilled like `onEditSprintDetails`: `SprintBoard.tsx` →
   `TicketTable`/`SingleSprintHeader` → `GroupStatBar` → popover. Opens the modal for
   that sprint id.
4. **Generate missing**: button closes the bundle modal and feeds the missing keys into
   the existing `testDocKeys` state (BRDG-426 queue). After the queue closes, the PO
   reopens the bundle (no auto-reopen in v1).

### Out of scope

- Rich-text/Confluence-format export (markdown only; refine when pasted output is seen).
- Automatic thematic grouping ("Group reservations", "Upsell") — the manual docs group
  related stories under theme headers; v1 orders by size and lets the PO restructure
  after pasting. Revisit with epic-based grouping if manual restructuring is a burden.
- Cross-team bundling (the sprint IS the team boundary).
- Auto-reopening the bundle after the generate-missing queue finishes.

## Implementation Plan

1. **Route** `src/app/api/sprints/[id]/test-docs/route.ts` (param must be `[id]` — `/api/sprints/[id]/suggest-goal` exists): tickets in sprint via `ticket_sprint` subquery, leftJoin `ticket_metadata`, excluding `removed_from_jira_at`, types `subtask`/`epic`, and draft statuses (`DRAFTING`, `REPLACED`, `DRAFT_FAILED`) — mirrors `/api/tickets/route.ts` filters. Partition: `documented` (doc + classification ok/needs_input, SP desc then key), `internal` (not_stakeholder_relevant), `missing` (no doc, DONE/TEST), `other` (no doc, rest). `sprintName` from `sprint_name_cache`.
2. **api-client**: new `sprints` namespace next to `sprintSlots` — `testDocsUrl(sprintId)` + `testDocs(sprintId)` + response type.
3. **SprintTestDocsModal** (`src/components/sprint-board/`): fetch via `useSWR(sprints.testDocsUrl(...))`; documented blocks via `renderMarkdown` with key chip (amber flag on needs_input), Misc tail (internal), missing list (amber) with "Generate missing (N)", muted `other` remainder. Footer: "Copy document" (`navigator.clipboard.writeText`, blocks + `**Misc**` header, no ticket keys) + toast confirmation + Close.
4. **Entry drilling** (three paths, all ending at `SprintDetailsPopover` `onTestDocs`): SprintBoard → TicketTable (`onSprintTestDocs(group.key)`) → GroupStatBar; SprintBoard → SingleSprintHeader → GroupStatBar; SprintBoard → SprintBoardHeader (title popover). Popover renders the MenuItem only for sprint kind.
5. **SprintBoard**: `testDocsSprintId` state + render next to `TestDocReviewModal`; `onGenerateMissing` closes the bundle and sets the existing `testDocKeys` queue.
6. **Tests**: route bucketing/exclusions/ordering test (model: `used-points/route.test.ts`); modal render/copy/generate-missing test.

## Acceptance Criteria

- [x] `GET /api/sprints/[sprintId]/test-docs` returns documented/internal/missing/other buckets with sprint name; missing = DONE/TEST without doc. <!-- src/app/api/sprints/[sprintId]/test-docs/route.ts -->
- [x] The sprint group header "..." menu offers "Test documentation" (sprint groups only, not epics). <!-- SprintDetailsPopover + GroupStatBar + SprintBoardHeader drilling -->
- [x] The bundle modal shows the documented blocks in order (big first), internal one-liners as a Misc tail, and the missing list. <!-- SprintTestDocsModal.tsx -->
- [x] "Copy document" puts the full markdown document on the clipboard (blocks + Misc section, no ticket keys). <!-- navigator.clipboard.writeText -->
- [x] "Generate missing (N)" opens the BRDG-426 validation queue for exactly the missing keys. <!-- SprintBoard testDocKeys hand-off -->
- [x] `needs_input`-classified docs are visibly flagged in the bundle. <!-- amber chip on the block -->

## Tests

- [x] Route buckets correctly: ok vs not_stakeholder_relevant vs missing (DONE/TEST only) vs other; subtasks and removed tickets excluded; 404 unknown sprint. <!-- route.test.ts -->
- [x] Modal renders blocks + missing list; Copy builds the expected markdown; Generate missing fires with the right keys. <!-- SprintTestDocsModal.test.tsx -->

## Related

- [[BRDG-426-generate-test-doc]] — prerequisite; produces and stores the per-story docs.
- Calibration: manual BT: 137/138/139 documents (ordering + Misc convention).
