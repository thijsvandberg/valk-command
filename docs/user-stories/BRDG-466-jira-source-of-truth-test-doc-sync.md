# BRDG-466: Jira is source of truth for accepted test docs (sync reconciles local copy)

**Status:** To Do
**Priority:** Medium
**Type:** Bugfix

## Description

When a test doc is deleted from a ticket's description in Jira, Bridge keeps showing it forever: the board marker stays green and the review popup still opens the old content (observed on VPL-46294). Likewise, when someone edits the test doc text in Jira, the popup keeps showing the stale accepted version.

Root cause: accepted test docs flow one way (Bridge writes the `:::expand Test documentation` block into the Jira description) but sync never reads them back. The local copy in `ticketMetadata.testDoc` is treated as its own truth and is never cleared or updated.

Decided behaviour: the Jira description is the source of truth for **accepted** test docs. On every sync, Bridge reconciles its local copy against the block in the incoming description:

- Block removed in Jira → clear the local accepted doc; the marker returns to the neutral "no doc" state (the ticket becomes eligible for generation again; if the PO deleted it because no doc is needed, they mark "not needed" in Bridge as before).
- Block edited in Jira → silently update the local copy; keep the existing classification.
- Block present in Jira but no local accepted doc → adopt it as accepted (mirrors a normal accept, including clearing any draft).

Drafts (`testDocDraft*`) and the `not_stakeholder_relevant` classification are Bridge-only concepts and are never touched by reconciliation.

## Current Behaviour

- Accepting a doc saves it to `ticketMetadata.testDoc` (+ `testDocUpdatedAt`, `testDocClassification`) and appends the block to the Jira description via `appendTestDocBlock` (`src/app/api/tickets/[key]/test-doc/route.ts:176-204`, `src/lib/test-doc.ts:30-34`). The Bridge copy is saved even when the Jira push conflicts.
- Sync (`upsertIssue`, `src/lib/upsert-issue.ts`) converts the Jira description ADF to markdown and stores it on `ticket.description` (line 252), block included, but never parses the block or writes any `testDoc*` field. Deriving the marker state (`deriveTestDocState`, `src/lib/test-doc.ts:45-55`) and the popup content (`GET /api/tickets/[key]/test-doc`) read only the local metadata row.
- Result: deleting or editing the block in Jira updates the local description mirror (so the expand disappears from the ticket detail description) but the marker, popup, and sprint delivery copy (`/api/sprints/[id]/test-docs`) keep serving the orphaned local copy.
- `upsertIssue` already has a pattern for sync-driven metadata changes (readiness clearing on story-point change, `src/lib/upsert-issue.ts:427-435`) and already emits `ticket:changed` events that make open boards revalidate (`src/lib/ticket-events.ts`).

## Proposed Approach

1. **Extract helper.** Add `extractTestDocBlock(description): string | null` to `src/lib/test-doc.ts`, reusing the existing `TEST_DOC_BLOCK_RE` (line 16) to return the inner markdown of the block, or `null` when absent. Keep it tolerant of the block sitting anywhere in the description.
2. **Reconcile in `upsertIssue`.** Next to the existing readiness-clearing pattern, compare `extractTestDocBlock(descriptionMarkdown)` against `meta.testDoc`:
   - **Present, differs** → update `testDoc`, set `testDocUpdatedAt` to Jira's `fields.updated` (avoids Bridge/Jira clock skew in the guard below), keep `testDocClassification`.
   - **Present, no local accepted doc** → adopt: set `testDoc` + `testDocUpdatedAt`; default classification to `ok` when none is set; clear draft fields (same as a normal accept).
   - **Absent, local accepted doc exists** → clear `testDoc`, `testDocUpdatedAt`, `testDocClassification`. Guards, to protect the just-accepted race and failed pushes:
     - skip when an unpushed local edit for the description exists (accept push still in flight or conflicted; the block has not reached Jira yet);
     - skip when Jira's `fields.updated` is not newer than `testDocUpdatedAt` (the sync payload predates the accept).
   - Never touch `testDocDraft*` fields or a `not_stakeholder_relevant` classification during clear/update.
3. **UI freshness.** No new plumbing expected: `upsertIssue` already emits `ticket:changed`, which revalidates board SWR caches so `testDocState` (and the marker) refresh. Verify the `GET /api/tickets/[key]/test-doc` response is not served from a stale server-side cache after reconciliation; invalidate it the same way the save route does (`route.ts:212-213`) if needed.

Existing stale rows (like VPL-46294) self-heal the next time `upsertIssue` processes the ticket (ticket-detail open or the next Jira update); no data migration needed.

**Non-goals:**
- No manual "delete test doc" action in the review popup (separate story if wanted).
- No Jira-side writes; reconciliation is read-only towards Jira.
- No change to draft generation, classification parsing, or the delivery-copy format.

## Implementation Plan

1. **`src/lib/test-doc.ts` — `extractTestDocBlock`.** Refactor the block pattern into a shared source string (with a capture group around the inner content) so `TEST_DOC_BLOCK_RE` and the extractor stay in lockstep; `TEST_DOC_BLOCK_RE` keeps its current behaviour. The extractor uses a fresh non-global regex per call (the module-level `g`-flagged regex carries `lastIndex` state and has no capture group). Unit tests in `src/lib/test-doc.test.ts`, incl. a round-trip with `appendTestDocBlock` and a repeated-call check.
2. **`src/lib/ticket-events.ts` — add `"test_doc"` to `TicketChangeKind`.** Needed because the orphan self-heal case changes only metadata (description mirror already lost the block on an earlier sync), so no `content` kind fires and no event would be emitted. Consumers treat kinds as opaque, so the addition is safe.
3. **`src/lib/upsert-issue.ts` — reconcile step** in the Metadata section of the existing transaction, next to the readiness-clearing pattern; reuse `meta`, `descriptionMarkdown`, `fields.updated`. Branches:
   - Adopt (`jiraDoc` present, no `meta.testDoc`): set doc + `testDocUpdatedAt = fields.updated`, classification `meta.testDocClassification ?? "ok"`, clear `testDocDraft*`; emit `test_doc` kind. Also adopt on brand-new tickets in the `!meta` insert (no event, like other new-ticket fields).
   - Update (`jiraDoc` present, differs from `meta.testDoc` per `markdownEqualIgnoringSpacing` — strict compare would churn on the markdown→ADF→markdown push echo): set doc + `testDocUpdatedAt`; classification and drafts untouched; emit `test_doc`.
   - Clear (`jiraDoc` absent, `meta.testDoc` set): null `testDoc`/`testDocUpdatedAt`/`testDocClassification` (preserve `not_stakeholder_relevant`), drafts untouched; emit `test_doc`. Guards: skip when a `ticketLocalEdit` row for `field = "description"` exists (unpushed/conflicted accept, incl. Story Writer drafts), or when `fields.updated <= meta.testDocUpdatedAt` (stale payload); a null `testDocUpdatedAt` does not block clearing.
4. **Cache freshness:** `GET /api/tickets/[key]/test-doc` reads the DB per request (no cache util) — nothing needed there. The board list/detail responses embed `testDocState` behind 30s/60s server TTL caches, so after the transaction, when a `test_doc` kind was added, invalidate `/api/tickets/{key}` and the `/api/tickets` list regex before `emitTicketEvent` (mirrors the save route).
5. **Tests in `src/lib/upsert-issue.test.ts`** using the existing `createTestDb`/`makeIssue` fixtures (string description bypasses the mocked `adfToMarkdown`; build blocks with the real `appendTestDocBlock`): clear (+ drafts and `not_stakeholder_relevant` survive, event emitted), update (+ spacing-only no-op), adopt (defaults `ok`, clears drafts), both guards, orphan self-heal (metadata-only change still emits `test_doc`).
6. **Manual verification on VPL-1337:** accept → delete block in Jira → sync (or ticket-detail open) → marker neutral without hard refresh, popup offers generation instead of the old doc; also the edit and adopt paths.

Design note: adopting on a ticket marked `not_stakeholder_relevant` keeps that classification but sets `testDoc`, so the marker shows accepted (testDoc wins in `deriveTestDocState`) — pasting a doc into Jira on a not-needed ticket is affirmative evidence a doc exists.

## Acceptance Criteria

- [x] Deleting the test doc block from a ticket's Jira description clears the local accepted doc on the next sync of that ticket; the board marker returns to the neutral state and the popup no longer shows the old content. <!-- reconcile step in src/lib/upsert-issue.ts + deriveTestDocState in src/lib/test-doc.ts -->
- [x] Editing the block content in Jira updates the local copy on the next sync; classification is preserved. <!-- update branch of the reconcile step -->
- [x] A block present in Jira with no local accepted doc is adopted as accepted; draft fields are cleared, classification defaults to `ok`. <!-- adopt branch of the reconcile step -->
- [x] A doc accepted in Bridge is NOT cleared by a sync that runs before the block lands in Jira (unpushed description edit, or Jira `fields.updated` older than `testDocUpdatedAt`). <!-- guards in the reconcile step -->
- [x] Drafts and the `not_stakeholder_relevant` classification are never modified by reconciliation. <!-- reconcile step leaves testDocDraft* and not_stakeholder_relevant untouched -->
- [x] An open board reflects the cleared/updated state without a hard refresh. <!-- rides the existing ticket:changed -> SWR revalidation via the new test_doc kind; /api/tickets server caches dropped in upsertIssue (GET test-doc route reads the DB per request, no cache) -->
- [x] Pre-existing orphaned rows (e.g. VPL-46294) self-heal on the next upsert of the ticket without a migration. <!-- reconcile runs on every upsertIssue pass; covered by the orphan self-heal test -->

## Tests

- [x] `extractTestDocBlock`: returns inner markdown when present (start/middle/end of description), `null` when absent, tolerant of surrounding whitespace. <!-- src/lib/test-doc.test.ts -->
- [x] Sync with block removed clears `testDoc`/`testDocUpdatedAt`/`testDocClassification`; draft fields and `not_stakeholder_relevant` survive. <!-- src/lib/upsert-issue.test.ts -->
- [x] Sync with edited block updates `testDoc` and `testDocUpdatedAt`, keeps classification. <!-- src/lib/upsert-issue.test.ts -->
- [x] Sync with new block and no local doc adopts it and clears drafts. <!-- src/lib/upsert-issue.test.ts -->
- [x] Guard: no clear while an unpushed description local edit exists; no clear when `fields.updated` <= `testDocUpdatedAt`. <!-- src/lib/upsert-issue.test.ts -->

## Related

- [[BRDG-465-test-doc-delivery-copy]] — the sprint delivery copy reads the same local `testDoc` rows; reconciliation keeps that copy honest too.
- `src/lib/test-doc.ts` block helpers (`appendTestDocBlock` / `stripTestDocBlock` / `TEST_DOC_BLOCK_RE`) — the block format this story parses back.
- `docs/architecture/jira-sync.md` — sync strategies that invoke `upsertIssue`.
- `docs/architecture/optimistic-updates.md` — pending-edits overlay; the unpushed-description guard leans on the same local-edit store.
