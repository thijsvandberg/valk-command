# BRDG-194: Dynamic Quick Prompt Chips Based on Story State

**Status:** Done
**Priority:** Medium

## Description

As the PO, I want the quick prompt chips (above the chat input) to update dynamically based on the current state of the story, so I always see the most relevant next actions instead of a static list.

## Context

The Story Writer chat shows quick prompt chips above the textarea. These are fetched once from `/api/settings/quick-prompts` and remain static for the entire session regardless of what happens in the conversation. This leads to awkward situations: after applying a title suggestion, "Suggest title" still shows as a chip, while "Find related stories" (which would be the logical next step) is hidden inside the actions popover.

## Current Behavior

- Quick prompt chips are fetched per issue type from `/api/settings/quick-prompts` and never change
- "Suggest title" always shows, even after a title has been applied
- "Find related stories" only exists in the `QUICK_ACTIONS` popover (lightning bolt), not as a chip
- After applying a title suggestion, the chips stay exactly the same
- The user has no visual cue that finding related stories is a logical next step

## Desired Behavior

1. Quick prompt chips react to story state changes (title set, draft exists, type changed, etc.)
2. After a title is applied:
   - Remove "Suggest title" chip (no longer relevant)
   - Add "Find related stories" chip (logical next action)
3. When the story has no draft content yet:
   - Keep "Improve my story/bug" chip but relabel contextually (e.g. "Write draft" when description is empty)
4. Chips update instantly on state change (no page reload or re-fetch needed)

## Implementation Plan

### Phase 1: State-Aware Chip Filtering in StoryWriterChat

- [x] Pass `hasTitle` (derived from `currentTitle`) and `hasDraft` (derived from `localDraft`) to the chip rendering logic in `StoryWriterChat.tsx`
- [x] Filter out prompts with id containing `"title"` or label `"Suggest title"` when `hasTitle` is true
- [x] Define a `CONTEXTUAL_PROMPTS` list of dynamic chips with visibility conditions:
  - `{ id: "ctx-find-related", label: "Find related stories", text: "Find related stories", visible: (state) => hasTitle && messages.length > 0 }`
- [x] Merge filtered API prompts with visible contextual prompts into the final `quickPrompts` array
- [x] Ensure the chip list re-renders when `currentTitle`, `localDraft`, or `messages.length` change

### Phase 2: Smooth Chip Transitions

- [x] Add enter/exit animation for chips appearing/disappearing (opacity + translateY, transform-only)
- [x] New chips appear at the start of the list to draw attention
- [x] Avoid layout jumps: use `min-height` on the chip container or animate height

### Phase 3: Extended Context Awareness (stretch)

- [x] After "Find related" has been executed (check messages for find-related intent), remove that chip too
- [x] When a draft has been accepted, show "Review Story" chip prominently
- [x] When linked issues exist, hide "Find related" and show "Review links" instead

## Acceptance Criteria

- [x] After applying a title suggestion, "Suggest title" chip disappears and "Find related stories" chip appears
- [x] Chips update without page reload
- [x] No layout jumps when chips change
- [x] Static quick prompts from the settings API still work as before (no regression)
- [x] The QUICK_ACTIONS popover is unaffected

## Technical Notes

- All logic is client-side in `StoryWriterChat.tsx`, no API changes needed for Phase 1
- The `currentTitle` prop is already passed to `StoryWriterChat`
- `localDraft` is already passed as a prop
- `messages` array is already available in the component
- The `onFindRelated` callback is already wired up in `ChatApp.tsx`
