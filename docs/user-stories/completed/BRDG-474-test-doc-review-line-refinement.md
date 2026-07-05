# BRDG-474: Refine the test-doc board line — bigger text, inline "please review", staleness note

**Status:** Done
**Priority:** Medium
**Type:** Improvement

## Description

PO feedback on the BRDG-471 draft-ready board line ([[BRDG-471-auto-test-doc-on-move-to-test]]):

1. **Text too small** — the whole status-change line reads at `text-caption` (10px), which is too small.
2. **The orange "Review test doc" button** — should read as sentence text like the rest of the line, not a button. Something like _"Test documentation generated, please review"_.
3. **Staleness** — if the story or comments changed **after** the draft was generated, the line should say so (the generated doc may be out of date).
4. **Persistence** — keep the test-doc line standing until the draft is accepted or skipped. A "seen" dismiss on **another topic** for the same ticket (e.g. the status change) must not clear the test-doc line.

## Current Behaviour (before this story)

- `src/components/sprint-board/StatusChangeLine.tsx`: the sentence span is `text-caption` (10px). A draft-ready line reads "Test doc draft ready to accept" and the affordance is a warning-tinted **Review test doc** button (`REVIEW_BTN`).
- `src/lib/status-changes-query.ts`: `listUnseenStatusChanges` reads `testDocDraftGeneratedAt` but only uses it for `changedAt` fallback; it exposes a boolean `testDocReady` and nothing about staleness.
- `src/hooks/useStatusChanges.ts`: `markSeen` optimistically removes the **entire** ticket row by `ticketKey`. On a ticket that also has a pending draft, dismissing the status change wipes the draft line until the server revalidation re-adds it (a flicker/clear — the exact thing point 4 complains about). The server layer already keeps the draft (no seen-key), so this is purely a client optimistic-update bug.

## Implementation

1. **Bigger text** — statusline sentence bumped `text-caption` → `text-body-sm` (10px → 12px), still subordinate to the 14px row title.
2. **Inline review clause** — new `TestDocReviewClause` in `StatusChangeLine.tsx` renders _"Test documentation generated &lt;time&gt;, please review"_, where **please review** is an inline link (shared `INLINE_LINK` recipe, matching the woven-in "new comments"/"a story edit" links) opening the review modal via `onViewTestDoc`. The `REVIEW_BTN` button and its `FileCheck2` icon are removed. A standalone draft-ready line IS this clause (with the generation time woven in); on a combined status+draft line it is appended as a trailing sentence. The neutral **View test doc** (accepted) and **Generate test doc** (none) buttons are unchanged.
3. **Staleness** — `status-changes-query.ts` takes the ticket's latest `storyVersion` and latest `jiraComment` (newest-first, per draft key — deliberately NOT 24h-bounded and NOT self-excluded, since a doc is generated from the story + comments) and, when that change post-dates `test_doc_draft_generated_at`, surfaces its `testDocStaleStoryAt` / `...By` and `testDocStaleCommentAt` / `...By` on `StatusChangeItem`. The clause appends a note ("the story changed since" / "new comments since" / "the story and comments changed since") in a **muted amber** (`color-mix` of the warning colour toward `--color-text-muted`) — more visible than the quiet grey sentence but softened from the full warning orange (PO feedback) — with a hover **tooltip** showing when + who made the change. No note when the generation instant is unknown (legacy draft).
4. **Persistence across dismiss** — `useStatusChanges.markSeen` (and `markAllSeen`) now transform a still-pending-draft row into its standalone draft-only form (`collapseToDraftOnly`) instead of removing it, matching what the server returns on refetch — so the "please review" line never flickers away when another reason on the same ticket is marked seen. The seen-POST still marks only the status/sprint/deploy ids (the draft has no seen-key), so accept/skip remains the only thing that clears it.
5. **Vertical alignment** — the statusline content div carries `min-h-7` so a button-less line (a draft-only "please review", which has no dismiss/move-to-bottom control) reserves the same height as a line with the `h-7` action buttons. Without it, `items-center` pulled the shorter line's text + elbow up tight against the row title above; now every statusline keeps the same gap below its row.

## Acceptance Criteria

- [x] The status-change line text is larger (12px, `text-body-sm`). <!-- StatusChangeLine sentence span -->
- [x] A pending draft reads as sentence text "Test documentation generated, please review" with an inline review link, not a button. <!-- TestDocReviewClause; REVIEW_BTN removed -->
- [x] When the story or comments changed after the draft was generated, the line appends a muted-amber stale note (more visible than grey, softer than full orange) with a hover tooltip showing when + who; a fresh draft shows none, and a legacy draft with no generation time shows none. <!-- testDocStaleStoryAt/By + testDocStaleCommentAt/By, muted amber, Tooltip -->
- [x] Dismissing the status change on a ticket that still has a pending draft leaves the "please review" line standing (no flicker/clear); accept or skip remains the only way to clear it. <!-- collapseToDraftOnly in markSeen/markAllSeen; draft has no seen-key -->
- [x] The neutral "View test doc" (accepted) and "Generate test doc" (none) affordances are unchanged. <!-- untouched branches -->
- [x] The draft-only line (no action buttons) keeps the same vertical gap below its row as a button-bearing line. <!-- min-h-7 on the statusline content div -->
- [x] The stale note is muted amber, not full orange, and carries a who/when tooltip. <!-- STALE_NOTE_COLOR color-mix + Tooltip content -->

## Tuning notes

- The stale-note colour is `color-mix(in srgb, var(--color-status-warning) 78%, var(--color-text-muted))` with `font-medium`. Easy to dial the amber up/down by changing the mix ratio.

## Tests

- [x] `listUnseenStatusChanges` surfaces `testDocGeneratedAt` and the staling change's when/who (`testDocStaleStoryAt`/`...By`, `testDocStaleCommentAt`/`...By`) for a story edit / comment after generation (incl. the acting user's own), not for activity before it, and not when the generation time is unknown. <!-- status-changes-query.test.ts -->
- [x] `StatusChangeLine` renders the inline "please review" clause (standalone and combined), fires `onViewTestDoc`, shows each stale-note variant, and no longer renders the "Review test doc" button. <!-- StatusChangeLine.test.tsx -->
- [x] `useStatusChanges.markSeen` marks only the status id for a status+draft line (never the draft). <!-- useStatusChanges.test.ts -->

## Related

- [[BRDG-471-auto-test-doc-on-move-to-test]] — the draft-ready board line this refines.
- [[BRDG-446]] — the deployAdded reason; the woven-in inline-link sentence pattern this reuses.
- `docs/architecture/workspace-integration.md` — updated with the new copy, staleness, and the `markSeen` transform.
