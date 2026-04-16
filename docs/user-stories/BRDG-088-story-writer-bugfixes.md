# BRDG-088: Story Writer — Bug Fixes

**Status:** Open
**Priority:** High

## Description

As the PO, I want two rendering and state bugs in the Story Writer fixed so the editor shows clean content and the UI stays consistent after deleting a session.

## Acceptance Criteria

### 1. Fix: italic/bold in list items renders stray asterisks in editor

- [x] Jira uses `*text*` for bold; when a list item contains bold+colon (e.g. `*Feature flag*:`) the story writer editor shows raw asterisks (`*Feature flag*:*`) instead of rendering the formatting
- [x] Identify where the Jira-to-editor conversion happens (Jira ADF or wiki markup to TipTap/ProseMirror HTML) and fix the parsing so `*text*` inside list items is converted to the correct bold mark
- [x] Verify with a list item that mixes bold, plain text, and a trailing colon — no stray `*` characters visible in the editor

### 2. Fix: "Resume session" button still visible after delete session

- [x] After confirming delete session, the "Resume session" button disappears immediately without requiring a page refresh
- [x] The local session state is cleared synchronously on delete so no stale UI is shown during the transition back to ticket single view

## Technical Notes

- Jira markup conversion: search for where Jira wiki markup or ADF is transformed before being passed to the editor
- Session state: check `useStoryWriter.ts` or the hook responsible for session state; ensure the local state is invalidated immediately on successful delete
