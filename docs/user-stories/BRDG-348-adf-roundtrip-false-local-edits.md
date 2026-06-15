# BRDG-348: ADF round-trip differences create false "Local edits" and diff noise

**Status:** Not Started
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

## Checklist

- [ ] **Before coding: confirm scope with the PO** - (a) BRDG-267 + BRDG-268 are in the same effort, (b) keep the comparison normalization vs. attempt a byte-stable round-trip (see "Coordination" + "Does the comparison layer survive...")
- [ ] Reproduce: edit only the title, switch detail tabs, confirm the description shows a phantom "Local edits" badge with formatting-only diff lines
- [x] Extend `normalizeMarkdownForCompare` to fold inline-mark ordering and inert-punctuation backslash escapes (comparison/diff only). Note: escaping on *structurally significant* punctuation and backslash-run differences are deliberately NOT folded (they can be real corruption, BRDG-280/267/268); panel-fence blank-line hugging was already handled
- [ ] Phantom badge no longer appears; tab switching introduces no local edit (live UI verification)
- [ ] A real content change is still detected and shown, without the surrounding formatting-only noise
- [x] Regression tests: artefact pairs compare equal; a real one-word edit still compares unequal (`src/lib/normalize-markdown.test.ts`)
- [ ] (Optional / may be split) Stop persisting drafts that are cosmetically equal to the Jira baseline
- [ ] All tests pass, build succeeds
