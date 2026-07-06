# BRDG-490: Epic Writer miscellaneous improvements (round 3)

**Status:** Backlog
**Priority:** Medium

## Description

As the PO, a third batch of Epic Writer refinements found while using the breakdown/refine/sprints flow. Small, mostly independent items. Several are close relatives of items in [BRDG-487](BRDG-487-epic-writer-misc-improvements-2.md) (round 2) - cross-referenced below so they are not built twice. This round should be done AFTER 487 (same components: `ChildStoryCard.tsx`, `EpicWriterLayout.tsx`, the phase rail).

Related: [BRDG-291], [BRDG-484](completed/BRDG-484-epic-writer-layout-navigation.md), [BRDG-487](BRDG-487-epic-writer-misc-improvements-2.md), [BRDG-488](BRDG-488-epic-writer-simplify-phases.md).

## Implementation Plan

Execution order: **Phase A** (shared-chat correctness first) 9 → 7; **Phase B** (card cluster) 2 → 1 → 5+6 (together) → 8; **Phase C** (layout/toggles) 4 → 3; **Phase D** (surfacing, largest) 10.

- **9 (bug, first):** The `QuickActionsPopover` fill path is sound in isolation. The break is context-specific: in the Epic Writer, `onFindRelated` is not passed to `StoryWriterChat`, so selecting "Find Related" (and the chip-row `ctx-find-related`) silently no-ops there. Ordinary prompts fill correctly. Reproduce with a real-popover render test (current `StoryWriterChat.render.test.tsx` mocks the popover to null, so it is uncovered): mount with a stub prompt, open popover, click a prompt row, assert the textarea fills. Fix the wiring if the fill genuinely fails; the epic `find-related` no-op is properly resolved by Task 10. Verify popover + chip-row stage in both writers.
- **7:** `ChildStoryCard` deepen button uses `hasBody ? "Refine" : "Deepen"`; "Refine" now clashes with the phase name (BRDG-488). Use one consistent label + a state-aware tooltip; do not reuse "Refine".
- **2:** Merge the header depth badge (Title/Bullets/Full via `cardDepth`/`DEPTH_META`) and the footer Draft pill into a single status representation consistent with `IssueMetaBadges`. Created cards keep `TicketRefPill`+`SprintOrBacklogBadge`; append depth compactly.
- **1:** Add per-card `collapsed` (session-scoped `Set<cardId>` owned by `BreakdownBoard`, NOT localStorage) + a chevron in the card header, plus a "Collapse all / Expand all" board button distinct from the existing board-wide Compact toggle (`ew:breakdown-compact`). Rule: board `compact` forces collapse; per-card `collapsed` applies otherwise.
- **5:** Extend PATCH `cards/[index]` to accept partial `title` (non-empty) / `bullets` (`string[]`) / `body`; widen `epicWriterApi.updateCard`; add a broader `updateCard(index, patch)` to the hook (keep `updateCardBody` as wrapper). Expose title + bullets editing for DRAFT cards only; created cards unchanged. No migration (columns exist).
- **6 (with 5):** Render `card.body` via `renderMarkdown(..., { linkifyRefs: true })` instead of raw text; replace the raw `<textarea>` with the shared WYSIWYG editor (RichEditor borderless, like `StoryDraftEditor`). Two edit affordances: bullets vs full body. Keep the seed-from-`card.body`/commit-on-blur behaviour.
- **8:** Give the Deepen and empty-board Generate-breakdown buttons the chip split affordance: primary = send now; secondary arrow = stage the same prompt in the chat compose box. Wire `pendingInput`/`onPendingInputConsumed` into `StoryWriterChat` from `EpicWriterLayout` (not passed today); staging reveals the chat if hidden. Single source of truth for the prompt strings (`deepenCard`/`generateBreakdown`).
- **4 (supersedes 487 #4):** Remove the standalone full-width `<PhaseRail>` row; render the phase steps inline in the `ViewHeader` row (slim inline variant). Keep `handleSelectPhase` wiring.
- **3:** Give `ChildStoryView` the BRDG-487 #3 toggling model: two persisted booleans (`ew:child:${childKey}:editor`/`:chat`, default on) surfaced via the same `EpicAppsMenu`-style check-item affordance; never both off; single pane takes full height.
- **10 (largest):** Add a "Related" `EpicRightView` rendering the shared `RelatedStoriesPanel`; wire `onFindRelated`/`relatedCandidates`/`onLinkCandidate`/`onOpenRelatedPanel` into the epic chat. Verify the server-side `<related-stories>` path for epics (session route must return `relatedCandidates`; apply-output must parse the tag) BEFORE building the UI. Reuses the pending-input wiring from Task 8.

Cross-cutting risk: `StoryWriterChat`, `QuickActionsPopover`, `RelatedStoriesPanel`, `RichEditor`, `renderMarkdown`, `useStoryWriter` are shared with the Story Writer / ticket detail. Keep changes additive (new optional props); run the full `story-writer/*` suite after 8/9/10.

## Tasks

### 1. Collapse/expand individual breakdown cards
The PO wants to fold/unfold single stories on the breakdown board, independently.
- [x] Each breakdown card can be collapsed (title only) / expanded (full card) on its own, remembered per card during the session.
<!-- Built together with the board-wide toggle: the BRDG-487 #2 persisted "Compact" boolean is superseded by a session Set<cardId> - per-card chevrons + a "Collapse all / Expand all" master button. Collapse is no longer persisted across reloads (cards are AI-regenerated). -->

- Relation: BRDG-487 #2 is a BOARD-WIDE compact/expand toggle; this is PER-CARD. Ideally build them together (a per-card toggle + a "collapse all / expand all").

### 2. Merge the DRAFT and depth (Title/Bullets/Full) indicators into one status
`ChildStoryCard.tsx` shows two separate signals: the `DRAFT`/created state, and a depth badge (`Title` / `Bullets` / `Full`, from `cardDepth`). Together they read as redundant/confusing.
- [x] Combine them into a single, clear status representation (e.g. one badge that conveys both "draft vs created" and how worked-out it is), consistent with Bridge's badge conventions.

### 3. Toggle chat vs editor when editing a story in the Epic Writer
When editing a child story in the writer, the layout is a fixed 50/50 chat|editor split, so each side gets too small.
- [ ] Let the PO turn the chat or the editor on/off (or heavily favour one) in the child-story edit view, instead of a forced 50/50.
- Relation: BRDG-487 #3 makes the chat a toggleable app in the main Epic Writer; this is the same idea applied to the child-story EDIT view (`ChildStoryView`). Build consistently - one toggling model, not two.

### 4. Fold the phase rail into the header (save vertical space)
The phase rail is its own full-width row under the header, costing vertical space.
- [x] Move the phase steps into the header row in a tidy way, so the rail no longer needs a separate row.
- Relation: this SUPERSEDES BRDG-487 #4 (which only re-aligned the rail's left edge). If 487 #4 is already done, this replaces it; if not, do this instead.

### 5. Edit DRAFT breakdown cards directly (not yet a Jira story)
A breakdown card that only has title/bullets/description (DRAFT, no Jira issue yet) can currently only be changed via chat. The PO wants to edit it directly.
- [x] Make DRAFT cards' title, bullets, and description editable in place (persist to `epic_child_draft`; there is already `updateCardBody` for the body - extend to title/bullets).
- Note: keep created-in-Jira cards' editing behaviour as-is (those round-trip through the story editor / Jira).

### 6. Render card detail as formatted markdown (+ inline formatted editor)
The expanded card detail ("Show detail") shows RAW markdown (`### User Story`, `- bullets`) instead of rendered markdown (`ChildStoryCard.tsx` prints `card.body` as text, no `renderMarkdown`).
- [x] Render the card detail as formatted markdown.
- [x] Ideally combine display + editing: an inline editor that shows the formatted markdown you can edit in place (reuse the story editor rather than a raw textarea).
- Note: editing the body vs the bullets are two different things, so expect two edit affordances (one for bullets, one for the full body). Ties into BRDG-490 #5 (editable DRAFT cards).

### 7. Clarify / unify the Refine vs Deepen card buttons
The card work-out button is one action (`onDeepen`) labeled by state: `hasBody ? "Refine" : "Deepen"` (line ~322). Same action, two labels - confusing, and "Refine" now collides with the phase name (BRDG-488).
- [x] Make the card work-out action clear: either one consistent label, or clearly-distinct labels/tooltips that explain "flesh out to full" vs "adjust the existing full story". Avoid clashing with the "Refine" phase name.

### 8. Card AI-action buttons: send-now vs stage-in-chat (split button)
The quick-prompt chips in the chat already offer two modes (send immediately, or drop the prompt into the compose box via the small arrow so the PO can edit it first - see the "Investigate" chip). The card actions (Deepen/Refine, and the empty-board "Generate breakdown") only send immediately.
- [x] Give the card AI-action buttons the same two-option affordance: primary = send now; secondary (arrow) = prefill the chat compose box with the prompt so the PO can tweak it before sending. Reuse the existing chip send/stage pattern in `StoryWriterChat` (`handleDirectSend` vs prefilling the input), don't reinvent it.

### 9. BUG: quick-suggestions popover (bottom-left) does not fill the prompt
Clicking a quick suggestion in the bottom-left `QuickActionsPopover` puts nothing in the compose box. Shared chat, so it affects both the Story Writer and the Epic Writer.
- Diagnosis: the wiring looks correct on paper - `QuickActionsPopover` item click -> `onSelect(prompt, id)` -> `fillInput(prompt)` -> `setInputValue(...)` in `StoryWriterChat.tsx`. So the likely causes are (a) the actions arrive `enabled: false` or with an empty `prompt` (so the item click is gated at `action.enabled && onSelect(...)`), or (b) a regression from the recent parallel edits to `StoryWriterChat.tsx` (BRDG-487 chat-as-app + BRDG-489 clear-chat both touched this file).
- [ ] Reproduce and fix so a quick suggestion fills the compose box (the "stage to edit" path). Verify BOTH the popover (bottom-left) and the chip-row stage buttons, in both writers.
- [x] Add a test covering popover select -> input filled.
<!-- Repro: the ordinary/special-prompt fill path works (new StoryWriterChat.popover.test.tsx: popover select fills the compose box; chip-row stage covered by the BRDG-460 render test). The residual dead affordance is the Epic Writer "Find Related" (popover + chip), which no-ops because onFindRelated was never wired into the epic chat - fixed in Task 10. Reproduce/fix checkbox closed after Task 10 + browser verify. -->

- Note: verify AFTER the BRDG-487/489 run lands - it may have introduced (or already fixed) this.

### 10. "Find related stories" should use the real related-stories (linkable) format
In the Epic Writer, "Find related stories" renders its result as prose with inline ticket pills + "Show more" (see screenshot) - you cannot act on them. It should use the standard related-stories format so the PO can link them directly.
- [ ] Surface the epic writer's related-stories result via the shared related-stories UI (`RelatedStoriesPanel` + the `relatedCandidates` the hook already tracks) with direct link actions, instead of a prose dump in the chat bubble.
- Relation: extends BRDG-478 #3 (which noted related-stories were not surfaced in the Epic Writer). Now they appear as prose; this makes them the proper, linkable format.

## Out of Scope
- The phase model itself (BRDG-488) and the sprint tab (BRDG-486).
- Re-architecting the writer beyond what each item needs.

## Acceptance Criteria
- [ ] Breakdown cards collapse/expand individually.
- [ ] A single, clear status replaces the separate DRAFT + depth badges.
- [ ] The child-story edit view no longer forces 50/50; chat/editor can be toggled.
- [ ] The phase rail lives in the header (no separate row).
- [ ] DRAFT cards' title/bullets/description are editable in place and persist.
- [ ] Shared-component changes do not regress the Story Writer or ticket detail; new/changed behaviour is covered by tests; `npm run test` and `npm run build` pass.
