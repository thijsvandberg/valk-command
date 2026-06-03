# BRDG-261: Chat message text must not overflow its bubble

**Status:** Not Started
**Priority:** Medium
**Type:** Bugfix

## Description

As a PO, I want long text in chat messages to wrap inside the message bubble, so that pasted URLs, GUIDs and other long unbroken strings stay readable instead of spilling outside the container.

Today, when a chat message contains a long unbreakable string (e.g. a pasted booking URL with query parameters, or a UUID like `52ab8a1f-93d8-4671-9ee6-53a77c8ed64b`), the text runs past the right edge of the message bubble and over the surrounding layout. The bubble has a `max-w` cap, but the content is not forced to break, so the line just overflows. See screenshot in the linked discussion: the `uat1-booking-v5...` URL and the GUIDs extend well beyond the bubble.

## Expected behaviour

- All message text stays within the bubble width.
- Long URLs, GUIDs, and other unbroken strings wrap (break mid-word where there is no natural break point) so nothing extends past the bubble's right edge.
- Normal prose continues to wrap on word boundaries as it does today; only genuinely unbreakable strings break mid-token.

## Out of scope

- Changing the bubble max-width or overall chat layout.
- Making long URLs clickable / truncating them with an ellipsis (could be a follow-up).
- Code blocks (these already scroll horizontally; only inline/plain text wrapping is in scope here).

## Technical notes

- Message bubble and text rendering: `src/components/story-writer/ChatMessageParts.tsx` (the `.description-content chat-markdown` blocks rendered via `renderMarkdown`, around lines 414-463). The bubble caps width with `max-w-[70%]/[75%]/[92%]` but the inner content lacks word-breaking.
- Likely fix: add `overflow-wrap: anywhere` / `break-words` (and a `min-w-0` on the flex child if needed) to the `.chat-markdown` content so unbreakable strings wrap. Confirm the `.chat-markdown` CSS in the global stylesheet before deciding whether to fix in CSS or via Tailwind classes.
- Verify in both message variants (user and assistant bubbles) since both use the same content classes.
- Other chat surfaces use the same patterns: check `src/components/chat/MessageList.tsx` and the standalone chat to confirm the fix covers them (or that they are unaffected).

## Implementation Plan

1. **Reproduce / confirm (checklist 1).** No code change. Confirm the Story Writer bubble wrapper and `.description-content chat-markdown` content divs in `ChatMessageParts.tsx` lack word-breaking and `min-w-0`, and that the wrapper sits inside a flex row. Confirm `MessageList.tsx` routes through `ChatBubble` (which has `overflow-x-auto` but no wrapping) and renders via `ReactMarkdown` + `markdown-components`, NOT `.chat-markdown`/`.description-content`.
2. **Add chat-scoped word-break CSS (checklist 2).** Add `overflow-wrap: anywhere` to `.chat-markdown` block text in `src/app/globals.css` (chat-scoped, not the global `.description-content`, to avoid changing the ticket viewer/editor). Do not touch `pre`/code (already `overflow-x: auto`).
3. **Add `min-w-0` on the Story Writer bubble wrapper (checklist 2).** In `ChatMessageParts.tsx`, add `min-w-0` to the bubble wrapper so the flex child can shrink below its content's intrinsic min-width and let `overflow-wrap` take effect within the `max-w-*` cap. This is the load-bearing flex fix.
4. **Cover standalone chat / MessageList (checklist 4).** `ChatBubble` uses `ReactMarkdown` (not `.chat-markdown`), so step 2 won't reach it. Add an `overflow-wrap: anywhere` utility to the `ChatBubble` bubble div in `src/components/shared/ChatBubble.tsx`.
5. **Verify bubble variants (checklist 3).** User (`max-w-[70%]`), assistant (`max-w-[75%]`), title/draft (`max-w-[92%]`), `contentAfter`, draft-preview, and expanded + truncated ("Show more") states all keep a long URL/GUID inside the bubble.
6. **Regression test (checklist 5).** In `ChatMessageParts.test.tsx`, render a message with a long unbreakable string and assert the bubble wrapper carries `min-w-0` (jsdom can't measure layout; `renderMarkdown` is mocked). Optionally a sibling test for `ChatBubble`.
7. **Tests + build (checklist 6).**

Decisions: use `overflow-wrap: anywhere` (not `word-break: break-all`, which breaks normal prose; not bare `break-words`, which doesn't fix flex min-content sizing). Scope wrapping to `.chat-markdown` / `ChatBubble`, not global `.description-content`.

## Checklist

- [x] Reproduce: long URL / GUID in a chat message overflows the bubble
- [x] Apply word-breaking so unbreakable strings wrap inside the bubble
- [x] Verify user and assistant bubbles, expanded and truncated ("Show more") states
- [x] Verify standalone chat / `MessageList` are also correct
- [x] Tests: rendering a message with a long unbroken string stays within container constraints
- [ ] All tests pass, build succeeds
