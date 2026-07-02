# BRDG-426: Generate stakeholder test documentation per story

**Status:** To Do
**Priority:** Medium
**Type:** Feature

## Description

At the end of each sprint, per-team test documentation is delivered to the customer/stakeholders (Valk): a compact list of what to verify per story, not full test scripts. Today this is written by hand (see the BT: 137/138/139 deliverables). This story makes Bridge generate that documentation **per story**, lets the PO **validate it in a split view next to the story**, and **saves** it as an expandable "Test documentation" block in the Jira description (visible to the whole team) plus a copy in Bridge.

Generation happens at the moment a story is being tested (not in bulk afterwards), so validating the doc is easy while context is fresh. Bulk generation over a multiselect exists as a convenience, but runs through the same one-by-one validation.

Sprint-level bundling (the copy-pasteable BT-style document + "which stories still miss a doc" overview) is **out of scope** here — that is [[BRDG-461-sprint-test-doc-delivery]].

The generation recipe below was calibrated in-session against the manually written BT: 137/138/139 documents: generating for all of sprint "BT: 139" (sprint 6361) from ticket data alone reproduced the manual sections almost verbatim and surfaced five guest-visible stories the manual document had missed.

## Generation recipe (calibrated)

**Inputs:** ticket title, type, full description (AC lives inside the description, the `acceptance_criteria` column is empty in practice), **all Jira comments** (primary source for preconditions, test data, environment caveats, impact — in the calibration the only usable content for VPL-46432 came from comments), and recent status changes.

**Output:** one compact markdown block per story, in English, written for the Valk stakeholder as reader. Three shapes:

1. **"Confirm that…" checklist** (default) — 1–8 bullets stating observable outcomes, no click-by-click steps.
2. **Numbered scenarios** — only for order-sensitive flows (setup steps + verify lines), like the promo-code reset scenarios in BT: 137.
3. **One-liner mention** — for changes stakeholders cannot meaningfully test (datalayer, BO-internal, sync groundwork); include an owner name when a comment reveals one ("Arend knows").

**Rules:**

- Translate ACs into observable behaviour; never copy implementation-level ACs ("column removed" → what the user/tester can see).
- Mine comments for preconditions: environment ("Test on VEE…"), config prerequisites, test data links, known impact.
- Enumerate variants (deposit types, multiroom, loyal combinations) and surfaces (apps, mails, receipts) explicitly — never "check everywhere".
- Quote exact UI/error strings verbatim when the story adds or changes user-facing text.
- Label optional/skippable checks as such ("confirmation email receipt lines are optional").
- The reader IS Valk: no "confirm with Valk" phrasing — turn those into direct checks or open questions to the reader.
- **`needs input` flag**: when the description is an empty template or otherwise insufficient (e.g. VPL-47182), return the flag plus a best-effort title-derived line instead of inventing scenarios.
- **`not stakeholder relevant` classification**: spikes, monitoring/ops tasks, test cleanup. Returned as a classification so the UI can say so instead of showing an empty doc.

## Current Behaviour

- BRDG-414 shipped a status-change review line; a change **to Test** renders an inert "Generate test prompt" button (`src/components/sprint-board/StatusChangeLine.tsx`, the `isTest` action, no `onClick`).
- Board rows have an action menu (`src/components/sprint-board/row-actions/useRowActions.ts` + `ticket-action-menu.tsx`) and a multiselect `BulkActionBar.tsx` with a shared bulk-dispatch pattern (bulk review, bulk generate subtasks).
- The workspace-task pattern for agent actions exists: `POST /api/tickets/[key]/suggest-subtasks/route.ts` / `suggest-epic` call `agentFetch` with a skill + ticket context and return `{ taskId, streamUrl }`, consumed via `useWorkspaceTask` + SSE (`docs/architecture/workspace-integration.md`).
- ADF↔markdown conversion supports expand blocks in both directions (`:::expand Title … :::` in `src/lib/adf-to-markdown.ts` and `src/lib/markdown-to-adf.ts`), so an expandable round-trips between Jira and Bridge.
- `ticket_metadata` holds PO metadata per ticket (`test_status`, scores, notes) — the natural home for the Bridge copy.

## Proposed Approach

1. **Workspace skill** `generate-test-doc` in the Valk Remote Workspace (`.claude/skills/`), implementing the recipe above. Returns the markdown block plus a classification (`ok` / `needs_input` / `not_stakeholder_relevant`).
2. **Route** `POST /api/tickets/[key]/generate-test-doc`: gather title, type, description, all comments, recent status changes; dispatch via `agentFetch` (mirror `suggest-subtasks`); return `{ taskId, streamUrl }`. Draft-key guard applies (`@/lib/draft-key`).
3. **Three entry points**, all opening the same flow:
   - Row action menu: new "Generate test doc" action (`useRowActions`).
   - `StatusChangeLine` to-Test button: replace the inert "Generate test prompt" stub (relabel to "Generate test doc").
   - `BulkActionBar`: "Generate test docs" for the multiselect; tickets are processed as a queue.
4. **Validation split view** (modal/overlay on the board):
   - Left: the generated doc, editable before saving (PO tweaks/deletes lines).
   - Right: the story rendered in the regular ticket format (same renderer as the detail panel), so validation happens with the story actually visible.
   - Actions: Save, Regenerate, Cancel; in bulk additionally Skip and a queue indicator ("3 / 12"), advancing after save/skip.
   - `needs input` / `not stakeholder relevant` results render as a clear notice (with the one-liner where applicable) instead of a doc.
5. **Save**:
   - Bridge: persist to `ticket_metadata` (new `test_doc` + `test_doc_updated_at` columns) — source of truth for BRDG-461 bundling and missing-doc detection.
   - Jira: append an `:::expand Test documentation` block at the end of the description (via the existing markdown→ADF path). Re-saving **replaces** the existing block, never duplicates it. The separate "Test Scenarios" template section stays untouched (it can hold more extensive scenarios).
   - Read `docs/architecture/optimistic-updates.md` before wiring the description write; the local-edit/pending-edits overlay and sync freshness (`jira_updated_at`) interplay applies.

### Out of scope

- Sprint-level bundle, copy-paste export, missing-doc overview → [[BRDG-461-sprint-test-doc-delivery]].
- Auto-generation on the move-to-Test status change (on demand only).
- Editing the doc later from the ticket detail panel (regenerate + re-save covers it for now).
- Feeding `test_status` / Test Center from this flow.

## Acceptance Criteria

- [ ] A `generate-test-doc` workspace skill produces a test-doc block per the calibrated recipe, including the `needs_input` and `not_stakeholder_relevant` classifications. <!-- VRW .claude/skills/generate-test-doc -->
- [ ] `POST /api/tickets/[key]/generate-test-doc` gathers description + all comments + recent status changes and dispatches the skill via the workspace-task pattern. <!-- mirror suggest-subtasks; agentFetch; { taskId, streamUrl } -->
- [ ] The row action menu offers "Generate test doc" for a single ticket. <!-- useRowActions + ticket-action-menu -->
- [ ] The to-Test status-change line button triggers generation (inert BRDG-414 stub replaced). <!-- StatusChangeLine.tsx isTest action -->
- [ ] The bulk toolbar offers "Generate test docs" for the multiselect and processes tickets as a queue. <!-- BulkActionBar.tsx -->
- [ ] Validation happens in a split view: editable doc left, the story in regular rendered format right; Save / Regenerate / Cancel, plus Skip + queue position in bulk. <!-- new split-view modal -->
- [ ] Saving stores the doc in Bridge and writes/replaces a `:::expand Test documentation` block at the end of the Jira description; the block never duplicates on re-save. <!-- ticket_metadata test_doc; markdown-to-adf expand -->
- [ ] `needs_input` and `not_stakeholder_relevant` results are surfaced clearly instead of showing a fabricated doc. <!-- split view notice states -->
- [ ] Draft tickets (DRAFT-xxx) never trigger a Jira write. <!-- @/lib/draft-key guard in the route -->

## Tests

- [ ] Route gathers the expected ticket context (description, comments, status changes) and dispatches the skill; 404 on missing ticket; guard on draft keys. <!-- src/app/api/tickets/[key]/generate-test-doc/route.test.ts -->
- [ ] Saving writes `test_doc` to ticket_metadata and produces a description with exactly one Test documentation expand block, replacing any existing one. <!-- save route/lib test -->
- [ ] Split view renders doc + story side by side; bulk queue advances on save and skip. <!-- component tests -->
- [ ] StatusChangeLine to-Test action triggers generation instead of the inert stub. <!-- StatusChangeLine.test update -->

## Related

- [[BRDG-414-active-sprint-status-changes]] — shipped the inert button this story makes real.
- [[BRDG-461-sprint-test-doc-delivery]] — follow-up: sprint bundle, copy-paste export, missing-doc overview.
- Pattern: `suggest-subtasks` / `suggest-epic` routes + `docs/architecture/workspace-integration.md`.
- `docs/architecture/optimistic-updates.md` — required reading before the description write.
- Calibration source: manual BT: 137/138/139 stakeholder documents; generated BT: 139 (sprint 6361) matched near-verbatim and found five missing stories.
