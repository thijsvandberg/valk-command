# BRDG-151: Story Writer Link Suggestions

**Status:** Draft
**Priority:** Medium
**Follow-up of:** [VPL-36161](https://new-story.atlassian.net/browse/VPL-36161)

## Description

As the PO, I want the Story Writer to proactively suggest linking related issues when I mention them in the chat, so I can create links without leaving the conversation.

Currently, linking issues is a separate manual action: the PO must open the Link Issue dialog from the ticket sidebar, search for the target issue, and create the link. When the AI or the PO mentions a specific ticket (e.g. "this relates to VPL-36161") in the Story Writer chat, nothing happens. The PO has to remember to link it later.

The workspace AI should detect when issues are mentioned in conversation and offer an inline link suggestion, similar to how type and title suggestions already work.

## Current Behavior

1. PO mentions a ticket key in the Story Writer chat (e.g. "this should be linked to VPL-123")
2. The AI may acknowledge it in its response, but no actionable UI appears
3. PO must manually open the Link Issue dialog from the ticket sidebar to create the link
4. Easy to forget, especially when multiple issues are discussed

## Desired Behavior

### A. Inline link input on the Links section (primary)

Same pattern as the subtasks inline input (`SubtasksSection`): an always-visible input row at the bottom of the Links list on the ticket sidebar/detail page.

1. Below the existing links, an inline input row shows with placeholder "Link issue..."
2. PO types a ticket key (e.g. "VPL-123") or part of a title; autocomplete dropdown appears (reuses existing search from `LinkIssueDialog`)
3. Selecting a result or pressing Enter immediately creates the link (default relation: "relates to")
4. The new link appears optimistically in the list (same optimistic pattern as subtask creation)
5. A relation type can optionally be chosen via a small dropdown prefix, but defaults to "relates to" for speed
6. The existing Link Issue dialog button remains available for advanced use (choosing specific relation types, browsing)

### B. AI link suggestions in Story Writer chat

When the AI detects mentioned issues or discovers related tickets during review:

1. PO mentions a ticket key or relationship in the chat (e.g. "this is blocked by VPL-123" or "link this to BRDG-045")
2. The workspace AI includes a `<link-suggestion>` tag in its response with the target issue key and suggested relation type
3. An inline **LinkSuggestionChip** appears in the chat message (same pattern as `TypeSuggestionChip` and `TitleSuggestionChips`)
4. The chip shows: relation type, target issue key + title, and a "Link" action button
5. Clicking "Link" creates the link via the existing `POST /api/tickets/[key]/links` endpoint and shows "Linked" confirmation state
6. If the issue is already linked, the chip shows "Already linked" in a muted state
7. The AI should also proactively suggest links when it discovers related issues during story review, not only when the PO explicitly asks

## Technical Notes

### XML tag format

```xml
<link-suggestion key="VPL-36161" relation="relates to" />
```

Or for multiple suggestions:

```xml
<link-suggestions>
<link key="VPL-36161" relation="relates to" />
<link key="BRDG-045" relation="is blocked by" />
</link-suggestions>
```

Valid relation values: `relates to`, `blocks`, `is blocked by`, `clones`, `is cloned by`, `duplicates`, `is duplicated by`

### Files to modify

**Part A (inline link input):**
- **`src/components/ticket-detail/LinksSection.tsx`** (or wherever links are rendered): Add inline input row at bottom of links list, following the `SubtasksSection` pattern
- **Reuse `LinkIssueDialog` search logic**: Extract the autocomplete/search into a shared hook or reuse the existing search API call

**Part B (AI suggestions in chat):**
- **`src/components/story-writer/ChatMessageParts.tsx`**: Add `LinkSuggestionChips` component, parse `<link-suggestion(s)>` tags, strip them from base content
- **`src/components/story-writer/StoryWriterChat.tsx`**: Pass the current ticket key and link handler down to the new component
- **`src/hooks/useStoryWriter.ts`** (or equivalent): Add a `createLink` action that calls the existing link API
- **Workspace skill prompt**: Update the `write-story-draft` skill instructions to tell the AI when and how to emit `<link-suggestion>` tags

### Existing patterns to follow

- **`SubtasksSection`**: inline input at bottom of list, optimistic creation, Enter to submit. This is the primary reference for Part A.
- `TypeSuggestionChip`: single inline chip with Accept/Applied state (reference for Part B)
- `TitleSuggestionChips`: boxed panel with multiple suggestions (reference for Part B)
- `RelatedStoriesInline`: already shows related issues with link toggle, but only after explicit "Find Related" action
- `LinkIssueDialog`: autocomplete search with keyboard navigation, reuse for the inline input

### Difference from Related Stories

The "Find Related" feature discovers issues based on content similarity. This feature is different: it handles **explicit mentions** in conversation and proactive AI suggestions during review, plus a fast inline input for direct linking. The two are complementary. Over time, link suggestions could also incorporate related story candidates, but that is out of scope for this story.

## Acceptance Criteria

### Part A: Inline link input
- [x] Links section shows an always-visible inline input row at the bottom (like subtasks)
- [x] Typing in the input triggers autocomplete search (reusing existing search logic)
- [x] Selecting a result or pressing Enter creates the link with "relates to" as default relation
- [x] New link appears optimistically in the list before API confirms
- [ ] Optional relation type dropdown prefix (defaults to "relates to")
- [x] Existing Link Issue dialog button remains available

### Part B: AI link suggestions in chat
- [ ] New `<link-suggestion>` / `<link-suggestions>` XML tags are parsed from AI responses in `ChatMessageParts`
- [ ] `LinkSuggestionChip` component renders inline in chat messages with target issue info
- [ ] Clicking "Link" creates the link via existing API and shows confirmed state
- [ ] Already-linked issues show muted "Already linked" state
- [ ] Multiple link suggestions in one message are supported
- [ ] Workspace skill prompt is updated so AI emits link suggestions when issues are mentioned or discovered
- [ ] AI proactively suggests links during story review (not only on explicit user request)

### General
- [ ] Tests for inline input, XML parsing, chip rendering, and link creation flow

## Out of Scope

- Overhauling the existing Link Issue dialog (covered by BRDG-150)
- Merging this with the Related Stories feature
- Auto-linking without PO confirmation (always require a click)
