# BRDG-088: Clickable title suggestions in Story Writer chat

**Status:** Completed
**Priority:** Medium

## Description

As the PO, I want to click a suggested title directly in the Story Writer chat response so that it is immediately applied to the Jira ticket, without having to copy-paste or manually type it.

## Background

When the story draft agent suggests title options, it renders them as plain markdown (numbered, bold list). The user currently has to manually read the options, pick one, copy it, and paste it into the title field. The screenshot below shows the pattern the agent already uses:

```
Here are 3 title options:

1. **Remove redundant accommodation type filtering from content-bff**
2. **Clean up accommodation type filter logic in content-bff**
3. **Drop double accommodation type filtering in content-bff**
```

The `write-story-draft` skill in the VRW already uses structured tags (`<story-draft>`) to signal when a full draft is ready. The same pattern should be applied to title suggestions: a `<title-suggestions>` tag with a structured list of options. The frontend can then render each option as a clickable chip. Clicking one immediately applies the title to the Jira ticket via the existing update API.

## Implementation Plan

1. **VRW prompt** (`write-story-draft.md`): Add "Title suggestions" section instructing the agent to wrap multi-title proposals in `<title-suggestions>` tags with an unordered markdown list. Single-title inline mentions skip the tag.

2. **Strip tag from display content** (`ChatMessageParts.tsx`): Add `<title-suggestions>` to the regex chain in `displayContent`, same pattern as `<story-draft>` and `<related-stories>`.

3. **Parse tags into title list** (`ChatMessageParts.tsx`): After `displayContent`, extract titles from `<title-suggestions>` tag content - split by newline, strip `- ` prefix, filter blanks.

4. **Legacy fallback detection** (`ChatMessageParts.tsx`): If no structured tag found, match the prose pattern "Here are N title options:" followed by numbered `**bold**` items. Does not strip from displayContent - chips appear additively below the text.

5. **`TitleSuggestionChips.tsx`** (new): Renders chips for each title. Props: `titles: string[]`, `onApply: (title: string) => void`. Internal state: `appliedTitle | null`, `applying: boolean`, `done: boolean`. On click: call `onApply`, show `Check` icon for 1.5s, then replace all chips with "Title applied: [title]" static line. Chips truncate at 60ch with `Tooltip` for full text. Brand palette styling (not blue). Chips disabled while `applying`.

6. **Wire `onApplyTitle` prop into `ChatMessage`** (`ChatMessageParts.tsx`): Add optional `onApplyTitle?: (title: string) => void` prop; render `<TitleSuggestionChips>` when titles are detected and prop is present.

7. **Propagate `onApplyTitle` through `StoryWriterChat`** (`StoryWriterChat.tsx`): Add `onApplyTitle?: (title: string) => void` to `StoryWriterChatProps`; pass it to each `<ChatMessage>`.

8. **Connect to `WriterContext.onTitleChange`** (`ChatApp.tsx`): Pass `onApplyTitle={writer.onTitleChange}` to `<StoryWriterChat>`. `onTitleChange` already calls `updateLocalTitle` which handles optimistic update + debounced persistence.

Dependencies: steps 1 and 2-4 are independent. Steps 5-6 depend on 3-4. Step 7 depends on 6. Step 8 depends on 7.

## Acceptance Criteria

### Phase 1: VRW - structured title suggestion output

- [x] `write-story-draft.md` is updated with a section instructing the agent to wrap title suggestions in `<title-suggestions>` tags when it proposes multiple title options
- [x] Tag format:
  ```
  <title-suggestions>
  - Remove redundant accommodation type filtering from content-bff
  - Clean up accommodation type filter logic in content-bff
  - Drop double accommodation type filtering in content-bff
  </title-suggestions>
  ```
- [x] The agent still renders a brief conversational sentence alongside the tag (e.g. "Here are 3 title options:")
- [x] The agent omits the tag when making a single title suggestion inline; the tag is only used when proposing alternatives to choose from
- [x] Existing `<story-draft>` tag behaviour is not changed

### Phase 2: Frontend - detect and render clickable chips

- [x] The Story Writer chat message renderer (`MessageList.tsx` or its story-writer variant) detects `<title-suggestions>` tags in assistant messages
- [x] Content inside the tag is parsed as a markdown unordered list; each list item becomes one clickable chip
- [x] Chips are rendered below the conversational text, styled consistently with the Story Writer's existing action surfaces (not generic blue, consistent with brand palette)
- [x] Each chip shows the full title text; if the title exceeds ~60 chars the chip truncates with an ellipsis and shows a tooltip with the full text on hover
- [x] The tag itself is not rendered as raw text in the message

### Phase 3: Frontend - apply title on click

- [x] Clicking a chip calls `updateLocalTitle()` from `useStoryWriterDrafts` which persists via `PATCH /api/tickets/[key]/story-writer` and `PUT /api/tickets/[key]/local-edits` (same flow as typing in the title field)
- [x] While the request is in flight, the clicked chip shows a loading state (spinner); the other chips are disabled and dimmed
- [x] On success:
  - The title field at the top of the Story Writer view updates instantly (optimistic update via `setSession`)
  - The clicked chip shows a brief "Applied" confirmation state (checkmark, ~1.5s) before the chips are replaced by the confirmation line
  - <!-- skipped: toast notification - `updateLocalTitle` is fire-and-forget with no success callback; adding a toast would require refactoring the debounced save chain. The "Title applied: [title]" confirmation line serves as the feedback. -->
- [x] After a title is successfully applied, the chips in that message are replaced with a single line: "Title applied: [chosen title]" (non-interactive, prevents accidental re-apply)

### Phase 4: Fallback for legacy (untagged) responses

- [x] Messages that contain the prose pattern "Here are N title options:" followed by a bold numbered list (already in agent history) are detected as a legacy fallback
- [x] The same clickable chip UI is rendered for these older messages
- [x] Detection is conservative: only trigger when the numbered list immediately follows the "title options" sentence and all items are in bold

## Technical Notes

### VRW changes (`/Users/thijsvandenberg/valk-workspace/tools/valk-remote-workspace`)

- Only file to change: `.claude/skills/write-story-draft.md`
- Add a "Title suggestions" section explaining the tag format and when to use it
- Keep the existing writing guidelines and `<story-draft>` tag behaviour intact

### valk-command changes

- `src/components/chat/MessageList.tsx` - add `<title-suggestions>` tag detection and chip rendering, similar to how `<json-output>` is already handled
- `src/app/api/tickets/[key]/route.ts` (or equivalent) - verify PATCH endpoint exists for updating Jira ticket summary; add if missing
- `src/components/story-writer/` - apply optimistic title update via existing state management
- No DB schema changes needed; title is stored in Jira

### Chip component

- New `TitleSuggestionChips.tsx` component, co-located in `src/components/chat/`
- Props: `titles: string[]`, `onApply: (title: string) => Promise<void>`, `applied?: string`
- Fully self-contained: manages loading/applied state internally

## Out of Scope

- Suggesting titles for plain (non-story-writer) chat conversations
- Allowing the user to edit a suggested title before applying it (they can still type in the title field manually)
- Persisting chip state across page reloads (dismissed chips stay dismissed per session only)
- Multi-select or ranking of title options
