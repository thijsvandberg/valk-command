# BRDG-234: Unify Standalone Chat with Story Writer Chat

**Status:** Not Started
**Priority:** Medium
**Type:** Enhancement

## Description

As a PO, I want the standalone Chat page (`/chat`) - both the conversations themselves and the conversation overview - to look and behave like the Story Writer chat, so that the chat experience is consistent and polished everywhere and any future chat feature is tidy by default.

Today there are three overlapping "chat shells" that assemble the same low-level primitives differently:

| Chat | Quality | Location |
|------|---------|----------|
| Story Writer chat | Best (quick-action button, model selector, Codebase toggle, compact input) | `src/components/story-writer/StoryWriterChat.tsx` |
| Ticket chat pane | Clean, compact | `src/components/shared/TicketChatPane.tsx` |
| Standalone `/chat` | Messy | `src/components/chat/ChatLayout.tsx` + `MessageList.tsx` + `MessageInput.tsx` |

The shared primitives `ChatBubble` and `ChatInput` already exist and are used across the app. The shared `ChatInput` even has `headerSlot` / `footerLeftSlot` / `footerRightSlot` / `resizable` slots designed to host exactly the Story Writer extras, but the Story Writer keeps its own forked copy of the input instead of using them. The core of this story is to finish that consolidation and route `/chat` through the polished, shared building blocks.

## Problems on `/chat` (observed)

1. **Thread/input width mismatch.** Messages are centered in a `max-w-3xl` column, but the input (`MessageInput` -> `ChatInput`) renders full-width with no matching wrapper, so the input looks heavy and misaligned. This is the biggest source of the messy feel.
2. **Bare input.** The standalone input has no model selector, no Codebase toggle, and no quick-action button that the Story Writer has.
3. **Per-message clutter.** Bulk-suggestion assistant cards render a "Markdown / Rich text" toggle pair under every card.
4. **Heavy user bubble.** The user bubble reads as much heavier/wider than the assistant card.
5. **Dense overview.** The conversation list has competing status dots and inconsistent spacing tokens.

## Requirements

### 1. Shared, reusable footer controls (the extras)

- Extract the model selector (Sonnet/Opus), the Codebase research toggle, and the quick-action popover button into reusable components.
- Both the Story Writer chat and `/chat` must consume the same components (no more forked copies).
- The quick-action **button (popover)** is used, not the inline chip row. The Story Writer keeps its existing story-specific actions; `/chat` gets a general-purpose action set (see open decision below).

### 2. Route `/chat` through the polished input

- The standalone chat uses the shared `ChatInput` with the footer controls from requirement 1.
- The input is constrained/aligned to the same width as the message column (no more full-bleed input).
- Keep existing behavior: send, follow-up resume, cancel/stop while streaming.

### 3. Clean up the message thread

- Consistent bubble widths; make the user bubble visually lighter, in line with Story Writer.
- Align the streaming/progress indicator styling with the Story Writer.
- Decision needed: remove the "Markdown / Rich text" toggles under bulk-suggestion cards, or keep them (see open decision).

### 4. Clean up the conversation overview (`ConversationList`)

- Calmer spacing using consistent design tokens.
- Reduce competing status indicators (unread dot, running-task dot, pinned icon, overflow menu) to a clearer hierarchy.
- Clearer visual distinction between the pinned section and the date groups.

### 5. Wire model + Codebase selections into the send path

- The model and Codebase choices made in `/chat` must actually be passed to the agent task, not be cosmetic.
- Verify the chat task submission (`useWorkspaceTask` / `submitAndStream`) accepts a model and codebase-research flag; extend if needed.

## Open decisions

- **Quick-action content for `/chat`:** reuse the existing quick-prompts settings system (`/api/settings/quick-prompts`) to populate the popover, or start with a small sensible default set.
- **Bulk-suggestion card toggles:** remove the "Markdown / Rich text" controls or keep them.

## Out of scope

- Story-writer-specific message rendering (drafts, related-stories inline, title/type/epic suggestions) on `/chat`.
- The multi-pane system.
- Investigation conversation rendering changes beyond shared styling.

## Technical notes

- Standalone chat shell: `src/components/chat/ChatLayout.tsx` (input wiring at ~line 574-600, no `max-w` wrapper around the input).
- Thread rendering: `src/components/chat/MessageList.tsx`; `MessageInput.tsx` (thin wrapper over `ChatInput`).
- Shared primitives: `src/components/shared/ChatInput.tsx` (already has footer/header slots + `resizable`), `src/components/shared/ChatBubble.tsx`.
- Story Writer chat reference (forked input + extras to extract): `src/components/story-writer/StoryWriterChat.tsx` (model selector ~line 640-654, Codebase toggle ~655-669, `QuickActionsPopover` ~616-632).
- `QuickActionsPopover` currently lives in `src/components/story-writer/ChatMessageParts.tsx`.
- Overview: `src/components/chat/ConversationList.tsx`.
- Send path: `src/hooks/useWorkspaceTask.ts`, `src/hooks/useMessages.ts`.
- Related prior work: BRDG-211 (ticket chat sidebar upgrade), BRDG-152 (story-writer quick actions), BRDG-194 (dynamic chat chips).

## Implementation Plan

### Key findings
- Shared `ChatInput` already exposes `headerSlot`/`footerLeftSlot`/`footerRightSlot`/`resizable`/`onCancel`/`pendingInput` + `useChatInputFill()`. Its internal shell is the same markup `StoryWriterChat` forked inline. The fork is real and removable.
- Extras to extract: model switcher (cycling Button + `MODEL_OPTIONS`, StoryWriterChat ~76-79/641-654), Codebase toggle (~655-669), and `QuickActionsPopover` (already standalone in `ChatMessageParts.tsx`, just move it). `QUICK_ACTIONS` data is in StoryWriterChat ~81-117.
- Send path (item 10) is the functional core. `submitAndStream(skill, args, conversationId?)` does NOT pass model/codebase today. Story Writer pattern: `model` is a top-level field in the agent task body; `codebaseResearch` is encoded as a text prefix `[codebase-research: on/off]` in args. `workspaceTasks.create` takes `Record<string,unknown>` and the route spreads the body, so a top-level `model` flows through with no route change for the first-message path. The follow-up path (`chat-messages/route.ts`) must be extended to read+forward `model`.
- "Markdown / Rich text" toggle = `CopyActions` (copy affordance, not a content-mode toggle). **Decision: KEEP** (useful for copy to Jira/Slack, already tested). No change in this story.
- Quick-prompts endpoint is keyed by issue type, semantically wrong for general chat. **Decision: use a small static chat-specific action set**, passed as a prop.

### Steps (dependency order)
1. **Extract shared controls** into `src/components/shared/chat-controls/`: `ModelSelector.tsx`, `CodebaseToggle.tsx`, move `QuickActionsPopover.tsx`. Re-export from `ChatMessageParts.tsx` to keep existing imports working.
2. **Migrate StoryWriterChat** to use the shared controls + shared `ChatInput` (headerSlot=chips, footerLeft=QuickActions+usage, footerRight=Model+Codebase, resizable). Move the 10s submit dedup into the `onSend` adapter; switch chip fill to `useChatInputFill()`/`pendingInput`. Highest-regression step; add render tests alongside.
3. **Route /chat input** through shared `ChatInput` with footer controls. Add `model`/`codebaseResearch` state in `ChatLayout`, pass through `MessageInput`.
4. **Align input width**: add optional content-width prop to `ChatInput`; pass `max-w-3xl mx-auto` from `MessageInput` (Story Writer keeps `max-w-4xl`).
5. **Lighter user bubble**: update `ChatBubble` user variant to Story Writer treatment (`bg-brand-600/0.18 text-text-primary border`), standardize `max-w-[75%]`.
6. **Streaming indicator**: extract shared `StreamingIndicator.tsx` (ping-dot + truncated text + optional cancel); use in `ChatLayout`, `StoryWriterChat`, `TicketChatPane`.
7. **Markdown/Rich text**: KEEP `CopyActions`, no code change.
8. **ConversationList polish**: unify indicator dot sizes/colors, tighten spacing, consistent pinned/date headers. Low-risk CSS only.
9. **Chat quick actions**: static `CHAT_QUICK_ACTIONS` set, passed to the popover in `MessageInput`; onSelect fills input (or direct-sends slash actions).
10. **Wire model + Codebase**: extend `submitAndStream(skill, args, convId, extra?)` to merge `extra` (e.g. `{ model }`) into `workspaceTasksApi.create`; encode codebase prefix in args. First-message + follow-up paths; extend `chat-messages/route.ts` to forward `model`. (Whether VRW `chat` skill honors them is unverified; Bridge-side forwarding is the deliverable.)
11. **Tests** for new shared components, StoryWriterChat render guards, ChatBubble, ChatLayout send args, chat-messages route model forwarding.
12. **Full verify + build**.

### Risks
- Step 2 (StoryWriterChat input migration) is the highest regression risk; no existing render test guards it - add tests.
- Step 10: Bridge forwards model/codebase, but VRW `chat` skill honoring them is unverified from this repo.
- `TaskProgress` shows tool-call detail the ping-dot indicator does not; acceptable trade for visual consistency.

## Checklist

- [ ] Extract reusable ModelSelector, CodebaseToggle, and QuickActionsPopover (popover) components into shared location
- [ ] Migrate Story Writer chat to consume the shared footer controls (remove forked copies)
- [ ] Route `/chat` input through shared `ChatInput` with footer controls
- [ ] Align input width with the message column (remove full-bleed input)
- [ ] Make user bubble lighter and bubble widths consistent in the thread
- [ ] Align streaming/progress indicator with Story Writer styling
- [ ] Decide and apply: remove or keep bulk-suggestion "Markdown / Rich text" toggles
- [ ] Clean up `ConversationList` spacing, status indicators, and pinned/date grouping
- [ ] Populate `/chat` quick-action popover (settings-driven or default set)
- [ ] Wire model + Codebase selections into the chat send path (verify/extend `submitAndStream`)
- [ ] Tests for new shared components and changed behavior
- [ ] All tests pass, build succeeds
