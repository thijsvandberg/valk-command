# BRDG-465: Per-story opt-in for unfinished stories in the sprint test doc

**Status:** To Do
**Priority:** Medium
**Type:** Feature

## Description

In the sprint test documentation bundle, the PO wants explicit per-story control over
whether an **unfinished** (not-Done) story is included in the copied "Copy document"
output. Today an unfinished story that already has a generated doc is silently added to
the delivery document; the PO has no way to leave it out short of not generating it.

The desired behaviour:

- An unfinished (not-Done) story is **excluded from "Copy document" by default**.
- A **checkbox appears only when a doc has already been generated** for that story
  (generation stays as-is; the existing per-row Generate button handles that).
- **Checking the box includes** that story's doc in "Copy document" **and** shows it
  written out in the "Documented" list above, so the PO gets a live preview of exactly
  what will be copied.
- Unchecking removes it again from both the preview and the copy.

Finished stories (DONE/TEST) keep working exactly as today: with a doc they are
auto-included, no checkbox.

## Current Behaviour

Sprint test docs bundle: `src/components/sprint-board/SprintTestDocsModal.tsx`, fed by
`GET /api/sprints/[id]/test-docs` (`src/app/api/sprints/[id]/test-docs/route.ts`).

The route buckets every real sprint ticket. The bucketing gates on **doc presence
first, status second** (route.ts:98-111):

```ts
if (row.doc) {
  if (row.classification === "not_stakeholder_relevant") internal.push(item);
  else documented.push({ ...item, needsInput: row.classification === "needs_input" });
} else if (row.classification === "not_stakeholder_relevant") {
  notNeeded.push(item);
} else if (row.status === "DONE" || row.status === "TEST") {
  missing.push(item);
} else {
  other.push(item); // "Not finished yet"
}
```

Consequences:

- Any ticket **with a doc lands in `documented`/`internal` regardless of status** — so a
  not-Done story that has a doc is already in the copy, with no opt-out.
- The `other` bucket ("Not finished yet") therefore only ever contains not-Done tickets
  **without** a doc. Its rows (`SprintTestDocsModal.tsx:348-372`) offer per-row Open /
  Generate / Skip, but no doc exists to include yet.
- "Copy document" is built by `buildTestDocDocument(data)`
  (`SprintTestDocsModal.tsx:58-67`) from `documented` + `internal` only. There is no
  selection state; whatever is in those buckets is copied.
- The doc block in the "Documented" section is **inline JSX**
  (`SprintTestDocsModal.tsx:279-301`) using the standalone `splitDocTitle` +
  `renderMarkdown`. Not yet a reusable component.
- A canonical checkbox primitive exists: `src/components/shared/Checkbox.tsx`
  (presentational; the interactive wrapper + `role="checkbox"` + `aria-label` live at the
  call site, see `BoardRow.tsx:550-561`).

## Proposed Approach

### 1. Route: hold unfinished docs out of the auto-included buckets

In `route.ts`, when a ticket has a doc, only auto-place it in `documented`/`internal`
when it is **finished** (status DONE or TEST). An unfinished ticket with a doc goes to
`other` instead, carrying its `doc`, `needsInput`, and enough classification info for the
client to render and place it.

- Extend `SprintTestDocItem` so `other` items can carry `doc` (already present in the
  type) plus a flag for the internal/Misc vs Documented split (reuse the existing
  `needsInput`; add an `internal?: boolean` or reuse `classification`). Keep the wire
  shape minimal.
- Finished (DONE/TEST) + doc → `documented`/`internal` (unchanged).
- Not-finished + doc → `other`, with `doc` populated.
- Not-finished + no doc → `other`, `doc` null (checkbox hidden, as today).

Keep the DONE/TEST boundary as the "finished" definition (consistent with the existing
`missing` bucket). See Open Questions for whether TEST should count.

### 2. Modal: checkbox selection on unfinished rows + live preview

In `SprintTestDocsModal.tsx`:

- Add ephemeral client state `selectedUnfinished: Set<string>` (default empty). Not
  persisted (see Open Questions).
- In the "Not finished yet" list, render the `Checkbox` primitive **only when
  `item.doc`** is present, wrapped in an interactive `role="checkbox"` cell mirroring
  `BoardRow.tsx:550-561`. Toggling adds/removes the key from `selectedUnfinished`. Rows
  without a doc keep only their existing actions.
- Extract the inline documented doc-block (`SprintTestDocsModal.tsx:279-301`) into a
  small reusable `TestDocBlock` component so it can render both the auto-included docs and
  the checked unfinished ones.
- The "Documented" / "Misc" sections render `data.documented` / `data.internal` **plus**
  the checked `other` items (routing internal-classified ones to Misc, the rest to
  Documented — mirror the finished split). Give the provisional (checked, unfinished)
  blocks a subtle "not finished yet" tag so the PO can tell them apart in the preview.
- Extend `buildTestDocDocument` to also include the checked unfinished docs (pass the
  merged documented/internal lists, or the selected set, rather than `data` alone), so
  "Copy document" matches the preview exactly.

### Non-goals

- No change to the "missing" (finished, no-doc) list — it keeps its all-or-nothing
  "Generate missing" button.
- No change to doc generation, the Generate/Open/Skip per-row actions, or the
  generate+validate queue (BRDG-426).
- Selection is not persisted to the DB.

## Open Questions

- **Persistence of the selection.** Recommended default: ephemeral per modal session
  (in-memory `useState`, reset on close). Fits the "check, then copy" flow in one sitting.
  Persisting per ticket would need a new metadata flag and is out of scope unless the PO
  wants the choice to stick across reopens.
- **Does TEST count as "finished" (auto-included) or as opt-in?** Recommended default:
  keep DONE **and** TEST auto-included (consistent with the current `missing`/`other`
  boundary), so only strictly-not-Done-not-TEST stories get the checkbox. If the PO means
  literally "not Done", TEST would move to opt-in too — a one-line change to the finished
  test.
- **Provisional block marker.** Recommended default: show a small "not finished yet" tag
  on checked unfinished blocks in the preview so they are visually distinct from finished
  deliverables. Drop it if the PO finds it noisy.

## Implementation Plan

### Part A — Route: bucket by finished-status first
1. Extend `SprintTestDocItem` in BOTH `src/app/api/sprints/[id]/test-docs/route.ts` (lines 7-18) and `src/lib/api-client.ts` (lines ~1090-1101) with one optional field `internalDoc?: boolean` (meaningful only on `other` items that carry a doc: `true` → Misc placement, else Documented). Also forward `needsInput` on those items for tag parity.
2. Rewrite the bucketing loop (route.ts 98-111) to gate on `finished = status DONE|TEST` first: finished+doc → documented/internal (unchanged); not-finished+doc → `other` carrying `doc`, `internalDoc`, `needsInput`; not-finished+no-doc → `other` with `doc:null`. Update the doc-comment block (26-32).

### Part B — Modal: reusable block + selection state
3. Extract the inline documented doc-block (SprintTestDocsModal.tsx 279-301) into a reusable `TestDocBlock` component (`{ item, onEditItem, provisional?, variant? }`); render a subtle "not finished yet" `Tag` when `provisional`. Reuse for both Documented and Misc via a `variant`.
4. Add ephemeral `selectedUnfinished: Set<string>` state (default empty, not persisted) + `toggleUnfinished`.
5. Compute merged lists via `useMemo`: `selectedOther = data.other.filter(o => o.doc && selectedUnfinished.has(o.key))`; `documentedAll = [...documented, ...selectedOther.filter(!internalDoc)]`; `internalAll = [...internal, ...selectedOther.filter(internalDoc)]`. Render these (and their counts / visibility guards) in the Documented + Misc sections; provisional blocks pass `provisional`.
6. In the "Not finished yet" rows, render an interactive `role="checkbox"` cell (mirroring BoardRow.tsx:550-561) with the `Checkbox` primitive ONLY when `m.doc` is present. No-doc rows keep Generate/Open/Skip unchanged.

### Part C — Copy output
7. Change `buildTestDocDocument` signature to `(documented, internal)` (two arrays) so copy matches preview; caller passes `documentedAll`/`internalAll` (memoized on `data` + `selectedUnfinished`).

### Notes
- The two duplicated `SprintTestDocItem` definitions must stay in sync.
- Provisional blocks are appended after auto-included ones (no re-sort); acceptable per story.
- Stale selection after SWR refresh self-heals via the `data.other` intersection.

## Acceptance Criteria

- [x] A not-Done story with a generated doc is **not** in "Copy document" by default. <!-- route.ts: not-finished + doc → `other`, excluded from documented/internal -->
- [x] Each not-Done row shows a checkbox **only when it has a doc**; no-doc rows show no checkbox and keep their existing Generate/Open/Skip actions. <!-- SprintTestDocsModal.tsx: role=checkbox cell gated on m.doc, before RowActions -->
- [x] Checking a not-Done row includes its doc in "Copy document". <!-- buildTestDocDocument(documentedAll, internalAll) fed by selectedUnfinished -->
- [x] Checking a not-Done row also renders its doc block in the "Documented" (or Misc, per classification) section above as a live preview. <!-- TestDocBlock rendered for documentedAll/internalAll incl. selectedOther -->
- [x] Unchecking removes the story from both the preview and the copied document. <!-- selectedUnfinished drives both render and copy memos -->
- [x] Finished (DONE/TEST) stories with a doc remain auto-included with no checkbox, exactly as today. <!-- route.ts finished branch unchanged; finished never enter `other` -->
- [x] Provisional (checked, unfinished) blocks are visually distinguishable from finished deliverables. <!-- "not finished yet" Tag + dashed brand border on provisional TestDocBlock -->

## Tests

- [x] Route: a not-Done ticket with a doc lands in `other` (with `doc` populated), not in `documented`/`internal`; a DONE/TEST ticket with a doc still lands in `documented`/`internal`. <!-- src/app/api/sprints/[id]/test-docs/route.test.ts -->
- [x] Modal: checkbox only rendered for `other` items that have a doc. <!-- SprintTestDocsModal.test.tsx -->
- [x] Modal: checking an unfinished row adds its block to the Documented preview and its text to the copied document; unchecking removes both. <!-- SprintTestDocsModal.test.tsx, assert buildTestDocDocument output + rendered blocks -->
- [x] `buildTestDocDocument` includes checked unfinished docs and excludes unchecked ones. <!-- unit test on buildTestDocDocument -->

## Related

- [[BRDG-461-sprint-test-doc-delivery]] — introduced this bundle modal and the buckets it changes.
- [[BRDG-463-bulk-test-doc-not-needed-confirm]] — sibling change to the same modal's not-needed flow.
- BRDG-426 — the generate + validate queue behind the per-row Generate action (unchanged here).
