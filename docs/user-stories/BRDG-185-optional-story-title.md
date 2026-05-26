# BRDG-185: Optional Story Title with AI Title Suggestions

**Status:** In Progress
**Priority:** Medium

## Description

As the PO, I want to create a new story without having to provide a title upfront, so that the story writer AI can immediately suggest 3 title options based on the context, reducing friction in the creation flow.

Currently both the command palette and the story writer launcher modal require a title before creating. The title field should become optional. When no title is provided, the story writer page should detect this and have the AI immediately generate 3 title suggestions using the existing `<title-suggestions>` tag system.

A placeholder title (e.g. "Untitled draft") should be used for the local DB record and the background Jira sync, and gets replaced once the user picks or writes a title in the story writer.

## Implementation Plan

1. **Backend: accept empty title** -- Update `create-draft/route.ts` to use `"Untitled draft"` when title is empty. Make `DraftSyncParams.title` optional in `draft-sync.ts`.
2. **Command palette: remove title validation** -- Remove "Title is required" guard in `useCommandPalette.ts`, conditionally omit `?title=` param. Update placeholder in `SubFlowForm.tsx`.
3. **Launcher modal: remove title validation** -- Remove title guard in `StoryWriterLauncherModal.tsx`, always enable confirm for new mode, update placeholder text.
4. **Auto-trigger title suggestions** -- Add `needsTitle` to `WriterContext`, derive in `StoryWriterLayout`, auto-send title request in `ChatApp.tsx` via `useEffect` when fresh session has no title. Guard with ref to fire once.
5. **UX polish** -- Detect `"Untitled draft"` as placeholder on reload. Ensure display title falls back gracefully.

## Acceptance Criteria

### 1. Make title optional in command palette new-story flow
- [x] Remove the "Title is required" validation in `useCommandPalette.ts` (`handleSubFlowConfirm`)
- [x] Allow confirm with empty title field in `SubFlowForm.tsx`
- [x] When title is empty, navigate to `/tickets/DRAFT-xxx/write` without a `?title=` param

### 2. Make title optional in StoryWriterLauncherModal
- [x] Remove the "Enter a story title" validation in `StoryWriterLauncherModal.tsx` (`handleCreateNew`)
- [x] Allow the "Create & open" button to be enabled even when title is empty
- [x] When title is empty, navigate to `/tickets/DRAFT-xxx/write` without a `?title=` param

### 3. Backend: accept empty title with placeholder
- [x] Update `POST /api/story-writer/create-draft` to accept missing/empty title
- [x] Use placeholder title `"Untitled draft"` for the local DB record and Jira sync when no title is provided
- [x] Mark the draft so the story writer page knows a title is still needed (e.g. a `needsTitle` flag or detecting the placeholder)

### 4. Story writer page: auto-trigger title suggestions
- [x] Detect when the story writer opens with no real title (placeholder or missing `?title=` param)
- [x] Automatically send the AI a system/user message requesting 3 title suggestions
- [x] The AI responds with a `<title-suggestions>` tag containing 3 options
- [x] Title suggestion chips render at the top of the chat (existing rendering in `ChatMessageParts.tsx`)
- [x] Clicking a title chip updates the ticket title (local DB + pending Jira update)

### 5. Placeholder text and UX hints
- [x] Update the title input placeholder text to hint that it is optional (e.g. "Story title (optional, AI will suggest)")
- [x] Do not show an error state when title is empty on submit

## Technical Notes

- Title validation currently lives in:
  - `src/components/command-palette/useCommandPalette.ts` lines 483-487
  - `src/components/shared/StoryWriterLauncherModal.tsx` lines 438-439
- Backend create-draft: `src/app/api/story-writer/create-draft/route.ts` lines 25-28
- Jira sync: `src/lib/draft-sync.ts` uses `params.title` as `summary` for Jira issue creation
- Title suggestion rendering already exists in `src/components/story-writer/ChatMessageParts.tsx` (lines 258-287) using `<title-suggestions>` tags
- The story writer chat system prompt likely needs a conditional instruction: "The user created this story without a title. Suggest 3 concise, descriptive titles."
- `canConfirm` in `StoryWriterLauncherModal.tsx` (line 472) currently requires `newTitle.trim().length > 0` for new mode

## Dependencies

- None (self-contained feature, builds on existing title-suggestions infrastructure)
