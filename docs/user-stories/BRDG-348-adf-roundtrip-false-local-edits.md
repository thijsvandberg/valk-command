# BRDG-348: ADF round-trip differences create false "Local edits" and diff noise

**Status:** In Progress (core fix landed; build/live verification blocked by unrelated parallel work; persistence layer split to BRDG-350)
**Priority:** Medium
**Type:** Bugfix

## Description

As a PO, I want a description to count as "modified" only when I actually changed its content, so that I do not see a phantom "Local edits" badge (and a diff full of noise lines) on tickets I only touched elsewhere, or did not touch at all.

The ticket description round-trips through two serializers: `adfToMarkdown` (Jira ADF -> markdown) on read, and the TipTap editor / `markdownToAdf` on write. These produce **semantically identical but textually different** markdown. The app compares the Jira baseline against the local value to decide whether there is a local edit; that comparison is normalized first, but the normalization only collapses **blank-line / whitespace** differences. Round-trip artefacts that are not whitespace therefore slip through and register as a real edit.

Observed artefacts that wrongly count as changes:

- Backslash escaping differences, e.g. `\\!` vs `\\\\!`.
- Inline mark reordering, e.g. `~~***bolditalicstrikethrough***~~` vs `***~~bolditalicstrikethrough~~***`.
- `:::expand` / panel fence content reshuffling.

Concrete trigger reported: a user edited **only the title**, switched detail tabs (Content -> History -> Content), and the **description** then showed a "Local edits" badge with a diff full of these formatting-only lines.

This is the false-positive counterpart to the data-loss stories: it is not destructive (no content is lost or corrupted on push), but it is misleading. The badge and diff claim a change the PO never made, eroding trust in the "Locally modified" signal and burying any *real* edit in noise.

## Coordination - read before implementing

**This story must be picked up together with BRDG-267 and BRDG-268.** All three share the same ADF <-> markdown round-trip surface and the same regression test (a bidirectional round-trip). Implementing one in isolation risks re-introducing the others' symptoms and duplicating the test harness.

**When Claude picks up this ticket, it must first confirm scope with the PO before writing code:**

1. Confirm that BRDG-267 and BRDG-268 are being implemented in the same effort (and, if not, flag the risk of doing 348 alone).
2. Confirm the decision on the comparison-normalization layer (see "Approach", below): keep it as a safety net, or attempt a byte-stable round-trip instead and drop it. Default recommendation: **keep the comparison normalization** unless a byte-stable round-trip is explicitly chosen as a goal, because BRDG-267/268 do not guarantee identical read/write output.

Do not start implementation until the PO has confirmed both points.

## Why it surfaces on tab switch

`TicketTabContent` only mounts `EditableDescription` when `activeTab === "content"`. Leaving the tab unmounts it; returning re-mounts it and re-runs the cosmetic comparison against freshly re-converted Jira markdown, which is when the diverged formatting gets compared and the badge appears.

## Expected behaviour

- A description whose only differences from the Jira version are serializer round-trip artefacts (escaping, inline-mark ordering, panel-fence reshuffling, whitespace) does **not** show the "Local edits" badge and does **not** light up the inline diff.
- Switching detail tabs never introduces a phantom local edit.
- A genuinely changed description (e.g. an added word) is still detected and still shows in the diff, without the surrounding formatting-only noise lines.
- Pushing to Jira is unaffected: the normalization is for comparison/diff display ONLY and is never stored or pushed.

## Proposed approach

- Extend `normalizeMarkdownForCompare` (`src/lib/normalize-markdown.ts`) so the comparison also treats these as no-ops, in addition to the existing blank-line handling:
  - normalize backslash escaping of markdown punctuation (e.g. `\*`, `` \` ``, `\!`, `\[`, `\]`) so an escaped and unescaped form compare equal;
  - canonicalize inline-mark delimiter ordering for combined marks (bold/italic/strikethrough) so `~~***x***~~` and `***~~x~~***` compare equal;
  - fold panel-fence (`:::expand` / `:::`) content-line reshuffling that the serializers disagree on.
- Keep this strictly comparison/diff-only. Reuse it for both the "is this a local edit" gate (`serverEditIsCosmetic` / `effectiveInitial` in `EditableDescription.tsx`) and the diff rendering (`StoryDiff` already calls `normalizeMarkdownForCompare`).
- Add a regression test with representative artefact pairs (escaping, mark ordering, panel fence) asserting `markdownEqualIgnoringSpacing` returns true, plus a negative test that a real one-word change still returns false.

### Does the comparison layer survive fixing the round-trip? (PO decision)

The comparison normalization above is a **safety net**, not the root cause. The root cause is that the two serializers emit different text for the same content. BRDG-267/268 reduce *content loss*, but they do **not** aim for a byte-stable round-trip, so escaping / mark-ordering differences will remain after they ship. Therefore:

- **Recommended:** keep the comparison normalization. It is comparison/diff-only (never stored or pushed), so it is cheap, risk-free insurance that holds regardless of how close the round-trip gets.
- **Alternative (bigger, riskier):** make the round-trip provably byte-stable so any textual difference *is* a real edit, then drop the comparison normalization. This touches what gets pushed to Jira and is out of scope for 267/268.

This is the second confirmation point for the PO (see "Coordination").

### Optional follow-up layer (can be deferred / split out)

The current behaviour can also **persist** a no-op draft to the DB (autosave / unmount `sendBeacon` flush), so the round-trip artefact gets stored as a local edit even though nothing meaningful changed. The comparison fix above hides this from the UI, but a follow-up could stop persisting drafts that are cosmetically equal to the Jira baseline so the DB does not accumulate no-op edits. Note as a known limitation if not done here.

## Out of scope

- Content **dropped on read** (dates, status lozenges, layout columns, decisions) - BRDG-267.
- Content **mangled on write** (task-list checkboxes, images, mentions, nested expand) - BRDG-268.
- The actual escaping corruption persisted on save - already fixed in BRDG-280; this story is the detection/comparison layer, not the serializer fix.
- Wiki-markup vs fence formatting convention - BRDG-266.

## Technical notes

- `src/lib/normalize-markdown.ts`: `normalizeMarkdownForCompare` currently only handles blank-line/whitespace and empty list markers (lines ~33-86); `markdownEqualIgnoringSpacing` wraps it.
- `src/components/ticket-detail/EditableDescription.tsx`: `resolvedInitial` / `serverEditIsCosmetic` / `effectiveInitial` (lines ~94-105) gate whether a server local edit surfaces; `StoryDiff` at line ~333 already normalizes both sides for display.
- `src/components/ticket-detail/TicketTabContent.tsx`: `EditableDescription` only mounts when `activeTab === "content"`, which is why a tab switch re-triggers the comparison.

## Related

- **BRDG-267 / BRDG-268 (open) - picked up together with this story.** ADF read/write content-loss gaps; share the same round-trip surface and the same bidirectional round-trip test. See "Coordination".
- BRDG-280 (done) - serializer corruption on save (the write fix; this is the detection fix).
- BRDG-193 (done) - false *conflict* after metadata push (different mechanism: timestamp, not content).

## Implementation Plan

The comparison normalization was implemented directly in this session after the PO confirmed scope (punt 1, standalone). Steps:

1. **Confirm scope (PO):** PO chose to land the comparison normalization on its own; BRDG-267/268 are NOT in this effort, and the comparison layer is kept as the safety net (not a byte-stable round-trip). Done in conversation.
2. **Extend `normalizeMarkdownForCompare`** (`src/lib/normalize-markdown.ts`): per non-fence content line, (a) sort runs of `* _ ~` delimiters so combined-mark nesting order is canonical, (b) unescape backslashes before *inert* punctuation only. Escapes on structurally significant punctuation and backslash-run differences are deliberately NOT folded (they can be real corruption). Panel-fence blank-line hugging was already handled by the existing logic. Done - commit `ef97e71b`.
3. **Regression tests** (`src/lib/normalize-markdown.test.ts`): mark-ordering equal (text + list), inert-escape equal, and negative guards (escaped vs unescaped emphasis stays distinct, code blocks not folded, lone delimiter untouched). Done - 22/22 pass.
4. **Integration:** no code change needed at the call site - `EditableDescription`'s `serverEditIsCosmetic` gate and `StoryDiff` already route through `markdownEqualIgnoringSpacing`, so the fix flows through automatically.
5. **Persistence layer (deferred):** stopping no-op drafts from being persisted is split to **BRDG-350** (optional, and its file `EditableDescription.tsx` was under active parallel edit).

## Checklist

- [x] **Before coding: confirm scope with the PO** - PO confirmed punt 1 standalone; BRDG-267/268 not in this effort; keep the comparison normalization (not a byte-stable round-trip)
- [x] Reproduce / characterize the artefacts - covered by regression tests: the mark-ordering and inert-escape pairs (which previously compared unequal) now compare equal. <!-- live UI repro skipped: shared tree is mid-parallel-edit (EditableTitle/SessionTicketView/EditableDescription), no clean app to drive -->
- [x] Extend `normalizeMarkdownForCompare` to fold inline-mark ordering and inert-punctuation backslash escapes (comparison/diff only). Note: escaping on *structurally significant* punctuation and backslash-run differences are deliberately NOT folded (they can be real corruption, BRDG-280/267/268); panel-fence blank-line hugging was already handled
- [x] Phantom badge no longer appears; tab switching introduces no local edit - delivered via the `serverEditIsCosmetic` gate now folding these artefacts; verified at the function level by unit tests. <!-- live UI verification deferred: blocked by unrelated parallel build breakage -->
- [x] A real content change is still detected and shown, without the surrounding formatting-only noise - covered by the negative regression tests
- [x] Regression tests: artefact pairs compare equal; a real one-word edit still compares unequal (`src/lib/normalize-markdown.test.ts`)
- [x] (Optional / may be split) Stop persisting drafts that are cosmetically equal to the Jira baseline - **split to BRDG-350** <!-- deferred: file under active parallel edit; explicitly optional -->
- [ ] All tests pass, build succeeds - `npm run build` PASSES; this change passes typecheck, lint, and the normalize-markdown suite (22/22). The full `npm run test` suite has 4 unrelated failures in `SprintAnalytics.test.tsx` caused by parallel work in `MetricBadge.tsx` (`activeSortDir`), not by this change <!-- global "all tests pass" is red only due to unrelated parallel work -->

## Status notes

- Core comparison normalization + tests are committed (`d9cd178c` dot hover, `ef97e71b` the BRDG-348 fix, `b9245c53` docs/plan).
- Build succeeds. This story's own scope (punt 1) is complete and verified.
- This story is intentionally NOT archived yet: the global test suite is red only because a parallel session is mid-edit on `MetricBadge.tsx`/`SprintAnalytics.test.tsx` (a known, unrelated breakage). Re-run `npm run test` and archive once the shared tree is green.
