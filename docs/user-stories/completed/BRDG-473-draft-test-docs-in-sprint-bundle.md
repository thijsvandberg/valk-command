# BRDG-473: Draft test docs in the sprint test-doc bundle

**Status:** Done
**Priority:** Medium
**Type:** Feature

## Description

The sprint test-doc bundle (the "Test documentation" modal that the PO copies to
stakeholders) only shows **saved/validated** docs today. Stories that have an
AI-generated **draft** but no saved doc yet are invisible in the document — they
sit in the "Missing documentation" gap list (finished stories) or the "Not
finished yet" list (unfinished stories). The PO must open and review each draft
one-by-one before the bundle looks complete.

The PO wants to see the full picture in one place:

1. **Finished stories with only a draft** appear inside the document (Documented /
   Misc), clearly marked as **draft**, without having to review each one first.
2. **A notice at the top** states that some stories still carry a draft test doc,
   so the reader knows the document is not fully finalized.
3. **A choice at the bottom, next to Copy document**, to include drafts in the
   copied text or leave them out. Default: **off** — drafts are unreviewed, so a
   plain copy stays limited to validated content unless the PO opts in.
4. **The "Not finished yet" box** (existing per-story opt-in, BRDG-465) must also
   let the PO include a story that has only a draft (currently the include
   checkbox appears only when a saved doc exists). Included draft blocks are
   tagged as draft there too.

Scope call (confirmed with PO): finished stories get their draft folded into the
document automatically; unfinished stories keep the existing per-story opt-in and
now support draft-only rows.

## Current Behaviour

- Bundle data comes from `GET /api/sprints/[id]/test-docs`
  (`src/app/api/sprints/[id]/test-docs/route.ts`). It buckets each real ticket in
  the sprint into `documented`, `internal` (Misc), `notNeeded`, `missing`, and
  `other` (not finished yet).
- A **draft** lives in `ticketMetadata.testDocDraft` /
  `testDocDraftClassification` (`src/db/schema.ts:202-204`), written by the
  generate flow (BRDG-426, `src/lib/test-doc-background.ts` `writeTestDocDraft`).
  A **saved doc** lives in `ticketMetadata.testDoc` / `testDocClassification`.
- The route selects the draft only as a boolean: `hasDraft: row.draft != null`
  (`route.ts:104`). It never sends the draft's content, and the route header
  explicitly notes the draft is "never read by the bundle". So a **draft-only**
  story (draft present, no saved doc) currently lands in:
  - `missing` when finished (DONE/TEST) — shows a "Regenerate" row action because
    `hasDraft` makes it look already-generated (`SprintTestDocsModal.tsx:286`).
  - `other` (not finished yet) when not finished — with **no** include checkbox,
    because the checkbox only renders when `m.doc` is truthy
    (`SprintTestDocsModal.tsx:738`).
- The copyable document is built by `buildTestDocDocument(documentedAll,
  internalAll)` (`SprintTestDocsModal.tsx:69-81`) from saved docs only, plus
  not-finished docs the PO ticked in (`selectedUnfinished`, BRDG-465,
  `SprintTestDocsModal.tsx:468-484`). `TestDocBlock` already has a `provisional`
  flag that paints a brand-tinted left accent + a "not finished yet" tag
  (`SprintTestDocsModal.tsx:344-400`).
- The footer holds only Close + "Copy document" (`SprintTestDocsModal.tsx:782-795`).

## Proposed Approach

### 1. Server: expose the draft as document content (route.ts)

- Also select `testDocDraftClassification` alongside the existing `draft`.
- Add `isDraft?: boolean` to `SprintTestDocItem` (both the route copy and
  `src/lib/api-client.ts:1100`). For a **draft-only** item (draft set, `doc`
  null), populate `doc` with the draft markdown and set `isDraft: true`, so all
  existing rendering (`TestDocBlock` renders `item.doc`) works unchanged. Use the
  **draft** classification to choose Documented vs Misc and the `needsInput` tag.
- Re-bucket draft-only items:
  - **Finished (DONE/TEST)**: push into `documented` (or `internal` when the draft
    classification is `not_stakeholder_relevant`) with `isDraft: true`. They no
    longer count as `missing`.
  - **Not finished**: push into `other` with `isDraft: true` plus the existing
    `internalDoc` / `needsInput` hints, so the "Not finished yet" list can offer
    the opt-in checkbox and a draft tag.
- Result: `missing` now means "nothing generated at all" (no saved doc **and** no
  draft) — a cleaner delivery gap.

### 2. Modal: draft tag, top notice, copy toggle (SprintTestDocsModal.tsx)

- **Draft tag:** add an `isDraft` treatment to `TestDocBlock` (reuse the
  `provisional` accent styling and add a `Tag color="amber"`/neutral "draft"
  chip). A block can be both provisional (not finished) and draft.
- **Top notice:** in the document pane, above the sections, add a line mirroring
  the existing "N finished stories miss test documentation" block
  (`SprintTestDocsModal.tsx:613-645`): e.g. "N stories still have a draft test doc
  — review to finalize." Count = draft-only items now folded into the document.
- **Copy toggle:** add an "Include drafts" checkbox next to "Copy document" in the
  footer, backed by local state, **default off**. `buildTestDocDocument` gets an
  `includeDrafts` argument (or the caller filters `isDraft` items out) so the
  copied text drops draft blocks when off. The preview pane keeps showing draft
  blocks (with the draft tag) regardless — the toggle only governs what is copied.
- **Copy guard:** `hasContent` / disabled state must reflect the toggle — if the
  only content is drafts and the toggle is off, copying yields an empty document,
  so disable Copy (or toast) in that case.

### 3. Not-finished box: opt-in for draft-only rows

- In the `other` ("Not finished yet") section, show the include checkbox for rows
  that have a draft too, not only saved docs: gate on `m.doc` being present (which
  is now also true for draft-only items since we populate `doc` with the draft) —
  verify the checkbox and `selectedOther` (`SprintTestDocsModal.tsx:468-471`)
  pick these up. Included draft blocks render with both the provisional accent and
  the draft tag.

### Non-goals

- No change to how drafts are generated, saved, or reviewed (BRDG-426 flow).
- No Jira writes; the bundle stays a Bridge-local read.
- Drafts that coexist with a saved doc (regenerate-after-save) are out of scope —
  those stories already appear via their saved doc; only **draft-only** stories
  are affected.

## Open Questions

- **Does the global "Include drafts" toggle also govern a not-finished draft the
  PO explicitly ticked in?** Recommended default: **yes** — one rule, "no draft
  content leaves in the copy unless Include drafts is on", is the simplest mental
  model. The per-story checkbox controls visibility/placement in the document; the
  footer toggle is the master switch for whether any draft-flagged block is
  copied. An implementer can flip this to "an explicit tick always copies" if the
  PO finds the master switch surprising.

## Implementation Plan

**Design decision:** store the draft markdown in the existing `doc` field for
draft-only items + add an `isDraft` boolean. Everything downstream already reads
`item.doc` (`buildTestDocDocument`, `TestDocBlock`, outline rail, not-finished
checkbox, `selectedOther`), so reuse avoids per-field branching. `isDraft` is the
single discriminator for the draft tag, the top-notice count, and the copy filter.

1. **Types** — add `isDraft?: boolean` to `SprintTestDocItem` in both
   `src/lib/api-client.ts` (~1100) and the route's own copy in `route.ts` (the
   interface is duplicated across both; keep in sync).
2. **Route bucketing** (`src/app/api/sprints/[id]/test-docs/route.ts`) — select
   `testDocDraftClassification`. Add a draft-only branch: when `row.doc` is null
   but `row.draft != null`, build `{ ...item, doc: row.draft, isDraft: true }` and
   classify by the **draft** classification. Finished (DONE/TEST) → `documented`
   (or `internal` when draft classification is `not_stakeholder_relevant`);
   not-finished → `other` with `isDraft` + `internalDoc`/`needsInput`. Order:
   `if (row.doc)` … `else if (row.draft != null)` … `else if (notNeeded)` …
   `else if (finished) missing` … `else other`. A saved-doc + newer-draft story
   keeps its saved doc (draft branch is only in the null-doc else). `missing` now
   means no saved doc AND no draft.
3. **Draft tag** — `TestDocBlock` gains an `isDraft` prop: apply the existing
   `provisional` left-accent when `provisional || isDraft`, add a `<Tag>draft</Tag>`
   chip. Pass `isDraft={item.isDraft}` at the Documented + Misc call sites.
4. **Copy filter** — add `includeDrafts` param (default `false`) to
   `buildTestDocDocument`; extend its `.filter(d => d.doc)` to
   `.filter(d => d.doc && (includeDrafts || !d.isDraft))`. Filter only inside the
   builder so the preview lists (`documentedAll`/`internalAll`) stay unfiltered
   (preview always shows drafts). `document` memo passes `includeDrafts`;
   `hasContent` derives from it, so Copy auto-disables when the only content is
   drafts and the toggle is off. Filtering the merged lists means an opted-in
   not-finished draft is also gated by the toggle = the resolved master-switch
   default.
5. **Footer checkbox** — `useState(false)` for `includeDrafts`; render an "Include
   drafts" `Checkbox` next to Copy, only when `draftCount > 0`.
6. **Top notice** — `draftCount = documentedAll.filter(isDraft) + internalAll.filter(isDraft)`;
   render a left-accented line "N stories still have a draft test doc — review to
   finalize." above the sections when `draftCount > 0` (no Generate button).
7. **Not-finished box** — no logic change: draft-only rows now carry `doc`, so the
   include checkbox + `selectedOther` pick them up; just pass `isDraft` through.
8. **Subtitle** — append `· N draft` to the header count line when drafts are
   folded in, so "documented" isn't silently inflated by drafts.
9. **Tests** — update the existing route test (a TEST story with a draft moves out
   of `missing`); extend `seedTicket` to seed drafts; add route + modal tests per
   the Tests section.

## Acceptance Criteria

- [x] The route returns draft content for draft-only stories, with `isDraft: true`, placed by draft classification. <!-- src/app/api/sprints/[id]/test-docs/route.ts -->
- [x] A finished (DONE/TEST) story with only a draft appears in the document (Documented or Misc), tagged as draft, and no longer in the "Missing documentation" gap list. <!-- route.ts bucketing + SprintTestDocsModal.tsx TestDocBlock isDraft -->
- [x] A notice at the top of the document states how many stories still carry a draft test doc. <!-- SprintTestDocsModal.tsx document pane, mirrors the missing block ~613 -->
- [x] An "Include drafts" choice sits next to "Copy document" in the footer, default off. <!-- SprintTestDocsModal.tsx footer ~782 -->
- [x] With the toggle off, the copied text excludes draft blocks; with it on, they are included. <!-- buildTestDocDocument includeDrafts + handleCopy -->
- [x] Draft blocks stay visible in the preview pane regardless of the toggle, always marked as draft. <!-- TestDocBlock isDraft tag -->
- [x] In the "Not finished yet" box, a story with only a draft can be ticked to include it, and renders as a draft block when included. <!-- SprintTestDocsModal.tsx other section leading checkbox ~738 -->
- [x] `missing` counts only stories with neither a saved doc nor a draft. <!-- route.ts -->

## Tests

- [x] Route buckets a draft-only finished story into `documented`/`internal` with `isDraft` and its draft content, and excludes it from `missing`. <!-- src/app/api/sprints/[id]/test-docs/route.test.ts -->
- [x] Route puts a draft-only not-finished story into `other` with `isDraft` and draft content. <!-- src/app/api/sprints/[id]/test-docs/route.test.ts -->
- [x] `buildTestDocDocument` excludes/includes draft items based on the `includeDrafts` flag. <!-- src/components/sprint-board/SprintTestDocsModal.test.tsx -->
- [x] Modal renders the top draft notice with the right count and a draft tag on draft blocks. <!-- src/components/sprint-board/SprintTestDocsModal.test.tsx -->
- [x] Toggling "Include drafts" changes what `handleCopy` writes to the clipboard. <!-- src/components/sprint-board/SprintTestDocsModal.test.tsx -->
- [x] A draft-only row in "Not finished yet" shows the include checkbox and folds into the document when ticked. <!-- src/components/sprint-board/SprintTestDocsModal.test.tsx -->

## Related

- [[BRDG-461-sprint-test-doc-bundle]] — the bundle this extends (the modal, buckets, and copy document).
- [[BRDG-465]] — per-story opt-in for not-finished docs; this reuses its `provisional` treatment and `selectedUnfinished` opt-in, now extended to draft-only rows.
- [[BRDG-426]] — the generate + draft cache flow that writes `testDocDraft`.
- [[BRDG-471-test-doc-bundle-row-actions-declutter]] — the current row-action layout in the gap lists.
