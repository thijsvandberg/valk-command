# BRDG-263: Inline "send now" button on quick action items

**Status:** Not Started
**Priority:** Medium
**Type:** Story

## Description

As a PO, I want a small send button next to each item in the quick actions popover, so that I can fire a quick action straight to the workspace in one click instead of having it dropped into the input and then pressing send myself.

Today, clicking a quick action (e.g. "Improve my story", "Add test scenarios", "Suggest title") only fills the chat input with the action's prompt; I still have to click the send arrow to actually run it. For prompts I never edit, this is an unnecessary second step. I want a small inline send icon on each row that immediately sends the prompt.

## Expected behaviour

- Each item in the quick actions popover shows a small send icon (e.g. `SendHorizontal`) on the right side of the row.
- Clicking the row label keeps today's behaviour: the prompt is placed in the input for editing.
- Clicking the inline send icon sends the prompt immediately and closes the popover, without first populating the input.
- The send icon respects the same enabled/disabled state as the action itself, and is disabled while the chat is busy (sending/streaming).
- The send icon has its own hover, focus-visible, and active states and `cursor: pointer`; clicking it must not also trigger the row's fill behaviour.

## Notes on existing behaviour

- Special actions keep their current handling:
  - **Find Related** opens the related-stories panel (no prompt to send) so it should not show a send icon, or the icon should be hidden for it.
  - **Match Epic** already sends directly today; its inline send icon (if shown) should match that behaviour.
- For codebase-aware prompts (e.g. "Technical analysis", `enableCodebase: true`), sending inline must still toggle codebase research on before sending, exactly as filling-then-sending does today.

## Out of scope

- Changing the set of quick actions or their prompt text.
- Redesigning the popover layout beyond adding the inline send affordance.
- Adding the inline send to anything other than the quick actions popover.

## Technical notes

- Popover component: `src/components/shared/chat-controls/QuickActionsPopover.tsx`. Each action currently renders a single `<button>` that calls `onSelect(action.prompt, action.id)`. Add a secondary inline send control per row and a new callback (e.g. `onSend(prompt, actionId)`) distinct from `onSelect`. The shared component is also used by the standalone chat, so keep the new prop optional and degrade gracefully when no send handler is provided.
- Story Writer wiring: `src/components/story-writer/StoryWriterChat.tsx` (popover rendered around lines 627-647). A direct-send path already exists: `handleDirectSend(text, enableCodebase)` (lines 401-417) which toggles codebase research, sets sending state, and calls `onSend(text)`. Wire the popover's inline-send callback to this, resolving `enableCodebase` from the matching API prompt (`apiPrompts`) and handling the `match-epic` / `find-related` special cases.
- Reuse the existing dedup guard already present in `handleDirectSend` (blocks an identical message within 10s).
- Action data shape: `QuickAction` in `QuickActionsPopover.tsx` (`id`, `label`, `icon`, `prompt`, `enabled`); actions are assembled in `StoryWriterChat.tsx` (`SPECIAL_ACTIONS` + `apiPrompts`, around lines 248-260).

## Implementation Plan

1. **QuickActionsPopover** (`src/components/shared/chat-controls/QuickActionsPopover.tsx`): change each row from a single `<button>` to a row container holding the existing label button plus an inline send icon button. Add an optional `onSend?: (prompt, actionId) => void` prop. The send icon only renders when `onSend` is provided AND the action is sendable (enabled, has a non-empty prompt, and is not flagged unsendable). The send button calls `e.stopPropagation()` and `onSend(...)`, never the row's `onSelect`. It is disabled when the action is disabled or `disabled` (chat busy). Use a `sendable` flag on `QuickAction` (optional, default true) so callers can suppress the icon for actions like Find Related.
2. **StoryWriterChat wiring** (`src/components/story-writer/StoryWriterChat.tsx`): pass `onSend` to the popover. Handler closes the popover and: for `match-epic` calls `onSend(prompt, "match-epic")`; otherwise resolves the matching `apiPrompts` entry and calls `handleDirectSend(prompt, ap?.enableCodebase === true)`. Mark the `find-related` special action as `sendable: false` so it shows no send icon.
3. **Standalone chat** (`src/components/chat/MessageInput.tsx`): leave fill-only by NOT passing `onSend` (its actions are open-ended starter prompts by design). Verify it still renders/behaves correctly with the new optional prop.
4. **Interactive states**: send icon button gets hover, focus-visible, active states and `cursor: pointer`, using existing design tokens (no default Tailwind blue/indigo).
5. **Tests** (`QuickActionsPopover.test.tsx`): inline send calls `onSend` not `onSelect`; label click still calls `onSelect`; send icon hidden when no `onSend` / `sendable: false` / disabled action; disabled state blocks send.

## Checklist

- [x] Add an inline send control to each row in `QuickActionsPopover`, with its own click handler that does not trigger the row's fill behaviour
- [x] Add an optional `onSend(prompt, actionId)` prop; hide/disable the send icon where there is no sendable prompt (e.g. Find Related) and while chat is busy
- [x] Wire Story Writer's inline-send to `handleDirectSend`, resolving `enableCodebase` per prompt and respecting `match-epic` special handling
- [x] Confirm standalone chat usage still works with the new optional prop
- [x] Interactive states: hover, focus-visible, active, `cursor: pointer` on the send icon
- [x] Tests: clicking the inline send sends the prompt directly (and closes the popover); clicking the label still fills the input; busy/disabled states block sending
- [x] All tests pass, build succeeds
