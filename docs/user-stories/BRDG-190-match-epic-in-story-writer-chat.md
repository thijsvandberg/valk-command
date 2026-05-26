# BRDG-190: Match Epic in Story Writer Chat

**Status:** Not Started
**Priority:** Medium

## Description

As the PO, I want to trigger the "Match Epic" quick action from the story writer chat, so the AI suggests the best-fitting epic and I can link it directly from the chat response without navigating to the ticket sidebar.

## Context

The "Match Epic" action already exists in the quick actions popover (`StoryWriterChat.tsx`) but is currently disabled (`enabled: false`). The backend (`/api/tickets/[key]/suggest-epic`) and the AI skill (`suggest-epic` in VRW) are already implemented and working in the `EpicPicker` sidebar component. This story wires up the chat-based flow so the AI response includes a structured epic suggestion block that the user can act on inline.

## Current Behavior

- "Match Epic" appears in the quick actions popover with a `Target` icon but is greyed out with a "soon" label
- Epic suggestions only work via the sparkle button inside the `EpicPicker` in the ticket sidebar
- The chat has no way to display or act on epic suggestions

## Desired Behavior

1. "Match Epic" quick action is enabled and uses the correct icon (the `Target` icon from the quick actions popover, matching the existing UI)
2. Clicking it triggers the suggest-epic flow through the chat
3. The AI response includes a structured `<epic-suggestion>` block
4. The chat renders this as a visually distinct "Epic Suggestion" card (similar pattern to the existing `LinkSuggestionChips` component)
5. Each suggestion shows the epic key, name, confidence level, and reason
6. A "Link" button lets the user set the epic on the current ticket directly from the chat

## Implementation Plan

### Step 1: Enable Quick Action + Wire Trigger
- [x] In `StoryWriterChat.tsx`: set `enabled: true`, `prompt: "Suggest the best epic for this story"`
- [x] In `onSelect` handler: add `match-epic` case that calls `onSend(prompt, "match-epic")` directly (no input pre-fill)

### Step 2: Backend Skill Routing
- [x] In messages route: add `skill === "match-epic"` handler (after find-related block)
- [x] Gather ticket + epic context from DB (same pattern as `/api/tickets/[key]/suggest-epic`)
- [x] Call `suggest-epic` VRW skill with `session.conversationId`, return via `taskCreatedResponse()`

### Step 3: Chat Rendering (Parser + Strip)
- [x] `parseEpicSuggestions(content)`: parse `<epic-suggestion>` XML tags and `<json-output>` JSON format
- [x] `stripEpicSuggestionTags(content)`: remove both formats from display content
- [x] Wire into `ChatMessage` rendering alongside link/title/type suggestions

### Step 4: EpicSuggestionCard Component
- [x] New file `src/components/story-writer/EpicSuggestionCard.tsx`
- [x] Design: bordered card with `Target` icon header, suggestion rows with confidence badges, Link/Linked buttons
- [x] Follow `LinkSuggestionChips` patterns: `applying`/`applied`/`errors` state sets

### Step 5: Wire onApplyEpic + currentEpicKey Through Component Tree
- [x] Add props through `ChatMessage` -> `StoryWriterChat` -> `ChatApp` -> parent
- [x] `onApplyEpic` calls `PATCH /api/tickets/[key]` with `{ epicKey }`, then mutates ticket data

### Step 6: Tests
- [x] Unit test for `parseEpicSuggestions` and `stripEpicSuggestionTags`
- [x] Unit test for `EpicSuggestionCard` rendering (suggestions, link action, already-linked state)
- [x] Integration test for the match-epic skill routing in the messages API

## Acceptance Criteria

### Quick Action
- [x] "Match Epic" is enabled in the quick actions popover (no "soon" label)
- [x] Clicking it immediately triggers the AI flow (no input pre-fill, direct send like "Find Related")
- [x] Uses the `Target` icon already present in the quick actions list

### Chat Response
- [x] AI response includes a structured epic suggestion block
- [x] The block renders as a distinct card below the message text
- [x] Each suggestion shows: epic key, epic name, confidence (high/medium/low), and a one-line reason

### Linking
- [x] Each suggestion has a "Link" button that sets the epic on the current ticket
- [x] After clicking "Link", the button changes to "Linked" (non-clickable, brand-colored)
- [x] If the ticket already has this epic, the button shows "Current" instead
- [x] The story writer header epic badge updates after linking

### Edge Cases
- [x] If no epics exist in the DB, the AI should respond with a message instead of an empty block
- [x] If the suggest-epic call fails or times out, show an error state in the message

## Technical Notes

- Reuse the existing `suggest-epic` VRW skill; no new skill needed
- The `EpicSuggestionItem` interface from `EpicPicker.tsx` (`{ key, name, confidence, reason }`) can be reused or shared
- Follow the same XML tag parsing pattern as `parseLinkSuggestions` / `LinkSuggestionChips`
- The card styling should match the `LinkSuggestionChips` component: same border, header, and button patterns
- The match-epic skill routing is similar to how "find-related" is handled: intercept the skill param in the messages route and adjust the VRW call

## Dependencies

- Existing `suggest-epic` VRW skill (BRDG-147)
- Existing `LinkSuggestionChips` component (design reference)
- Quick actions popover in `StoryWriterChat.tsx`
- `ChatMessageParts.tsx` tag parsing system
