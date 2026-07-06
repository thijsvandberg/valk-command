# BRDG-487: Epic Writer miscellaneous improvements (round 2)

**Status:** Done
**Priority:** Medium

## Status

Shipped 2026-07-06. All ten items done and verified E2E on epic VPL-47279 and the shared Story Writer (VPL-1337): bigger card font; expand/compact toggle (persisted, `ew:breakdown-compact`); chat as a toggleable app in `EpicAppsMenu` (persisted `ew:{key}:chat`); phase rail aligned to the header wordmark; attribute-tolerant `<story-detail>`/`<story-draft>` strip in the shared chat; editor `<p>` spacing tightened scoped to the editor (read views unchanged); editor scrolls via `borderless` mode; the epic's edited local draft now reaches the AI context (`buildEpicContext`); card Jira key as `TicketRefPill` + standard `SprintOrBacklogBadge`; drag-to-reorder persisted via a new `PUT .../cards/reorder` route that reassigns `card_index` and remaps `suggestedLinks.targetIndex`. Drag + persist confirmed against the running app (DB verified). No new console errors (a pre-existing nested-button hydration warning in `RelatedStoriesInline`/`SuggestionCard` is unrelated). Lint, typecheck, full suite, and build all green.

## Description

As the PO, I want a second batch of Epic Writer polish and small UX fixes found while using the now-working breakdown/detail/sprints flow. Running catch-all bucket; small, mostly independent items. A few are more feature-y (marked) and can be split out if this grows too big.

Related: [BRDG-291], [BRDG-484](completed/BRDG-484-epic-writer-layout-navigation.md) (layout), [BRDG-486](BRDG-486-epic-writer-sprint-planning-tab.md) (sprint tab / badges), [BRDG-478](BRDG-478-epic-writer-misc-improvements.md) (round 1).

## Tasks

### 1. Breakdown card font is too small
The breakdown card text (`ChildStoryCard.tsx`) is hard to read.
- [x] Increase the breakdown card font to a comfortable, consistent size (title + bullets).

### 2. Breakdown expand / compact toggle
The PO wants to collapse cards to just titles instead of always seeing all bullets/links.
- [x] Add an expand/compact control on the breakdown board: compact = titles only, expanded = full card. Persist the choice.

### 3. Chat should be a toggleable app *(feature-y)*
The chat is always pinned on the left. It should be one of the switchable "apps" you can turn on/off, so the PO can, e.g., give the breakdown/board full width.
- [x] Make the chat pane a toggleable app in the same switcher model as the other views (`EpicAppsMenu` / `EpicWriterLayout`), not a permanent column.

### 4. Progress steps alignment
The phase rail is flush-left, as if it belongs to the chat column. It should align to the header content start (the `bridge_` logo), not the far left. (See header screenshot: logo + ticket pill are indented; the steps are not.)
- [x] Align the phase rail's left edge with the header content (logo), so it reads as page chrome, not part of the chat.

### 5. Deepen response shows raw `<story-detail>` in the chat
The deepen turn renders `<story-detail index="0">...` as raw text with a "Show more". `ChatMessageParts.tsx` strips `<story-detail>` (line ~368) but the regex only matches the bare tag; the real tag carries an attribute (`<story-detail index="0">`), so it is not stripped. Follow-up to BRDG-478 #5.
- [x] Make the strip regexes attribute-tolerant (e.g. `<story-detail\b[^>]*>[\s\S]*?</story-detail>`); re-check the other epic tags for the same gap.

### 6. Paragraph spacing in the story editor looks off
In the story edit (WYSIWYG) view the paragraph spacing looks wrong.
- [x] Fix `<p>` spacing in the story editor. CAUTION: verify the paragraph spacing is not over-applied elsewhere (shared prose/markdown styles) - fix it without regressing `<p>` spacing in the chat, ticket detail, or draft previews.

### 7. Story edit (WYSIWYG) pane does not scroll
The edit-story editor content cannot be scrolled when it overflows.
- [x] Bound the editor pane height so its content scrolls independently (same class of fix as the breakdown/chat independent-scroll work in BRDG-484).

### 8. Draft must be editable and the edit must reach the chat *(feature-y)*
When viewing a draft the PO expects to edit its content; and after editing, asking a question in the chat must use the edited version. Today the epic breakdown/detail turns build context from the persisted description (`buildEpicContext` reads `epicRow.description`), so unsaved local edits to the draft may not reach the AI.
- [x] Make the draft content editable in its view.
- [x] Ensure the current (edited) draft is included in the chat/AI context so answers reflect what the PO just changed, not the last-saved/Jira version.

### 9. Breakdown card: ticket pill + standard sprint styling
On the child-story card (`ChildStoryCard.tsx`) the Jira key (`VPL-47191`) is plain mono text, and the sprint badge (`GXP: Backlog`, `CalendarRange` badge added in BRDG-486) is styled in a way Bridge does not use elsewhere.
- [x] Render the card's Jira key as the shared `TicketRefPill`.
- [x] Replace the bespoke sprint badge with Bridge's standard sprint representation (match how sprints are shown on the board / elsewhere).

### 10. Breakdown drag-to-reorder *(feature-y)*
The PO wants to reorder breakdown cards by dragging.
- [x] Enable drag-to-reorder of breakdown cards, persisting the order (note: card links reference cards by index - keep indices/links consistent after a reorder).

> "Clear chat" moved to its own story [BRDG-489](BRDG-489-clear-chat-story-and-epic-writer.md) - it applies to both the Story Writer and the Epic Writer, so it does not belong in the epic-only bucket.

## Out of Scope
- The sprint-planning tab itself (BRDG-486).
- Re-architecting the Epic Writer beyond what each item needs.

## Acceptance Criteria
- [x] Each task is implemented or explicitly split into its own story.
- [x] Shared changes (ChatMessageParts, prose `<p>` styles, TicketRefPill) do not regress the Story Writer or ticket detail.
- [x] New/changed behaviour is covered by tests; `npm run test` and `npm run build` pass.
