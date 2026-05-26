# BRDG-192: Sync Browser Tab Title with Story Writer Title

**Status:** Done
**Priority:** Low

## Description

As the PO using the Story Writer, I want the browser tab title (`<title>`) to update when a title is chosen or changed, so I can easily identify which story I'm working on when switching between browser tabs.

## Current Behavior

- The `page.tsx` for the Story Writer sets the browser tab title using `ticketData?.title ?? draftTitle` (from URL search params)
- For draft stories (DRAFT-* keys), `ticketData` does not exist, so the tab title falls back to the `draftTitle` URL param
- When the AI suggests a title and the user accepts it (via `handleTitleChange` / `writer.updateLocalTitle()`), the session's `localTitle` updates but the `<title>` tag in `page.tsx` does not re-render because it doesn't read from the session
- Result: the browser tab keeps showing "DRAFT-xxxxxxxx - Story Writer | Bridge" even after a title has been chosen
- The issue key is also missing from the tab title when the draft hasn't been pushed to Jira yet

## Desired Behavior

1. When a title is chosen or changed in the Story Writer (via AI suggestion, manual edit, or title prompt), the browser tab `<title>` updates to reflect the new title
2. Format: `{KEY} - {title} - Story Writer | Bridge`
3. For drafts before a title is set: `{DRAFT-KEY} - Story Writer | Bridge` (current behavior, fine as-is)
4. For drafts after a title is set: `{DRAFT-KEY} - {chosen title} - Story Writer | Bridge`
5. For existing Jira tickets: keep current behavior (`{VPL-KEY} - {title} - Story Writer | Bridge`)

## Root Cause

`page.tsx` computes the display title as:
```typescript
const displayTitle = ticketData?.title ?? draftTitle;
```

This only reads from `ticketData` (SWR fetch for Jira tickets) or `draftTitle` (URL search param set at navigation time). Neither source updates when the user picks a title inside the Story Writer session. The session's `localTitle` is the canonical source for the working title but is not propagated to the page-level `<title>`.

## Implementation Plan

### Option A: Lift localTitle to page level

- [ ] Expose the session's `localTitle` from `useStoryWriter` or via a callback/ref so `page.tsx` can read it
- [ ] Update `page.tsx` title computation to prefer `localTitle` over the static `draftTitle`:
  ```
  const displayTitle = localTitle ?? ticketData?.title ?? draftTitle
  ```
- [ ] Verify `usePageTitle` re-renders when `localTitle` changes (it should, since it's a hook dependency)

### Option B: Set document.title from StoryWriterLayout

- [ ] In `StoryWriterLayout.tsx`, add an effect that updates `document.title` whenever the resolved display title changes (line ~742 already computes `rawTitle`)
- [ ] This avoids changing the page/layout component contract

### Tests

- [ ] Unit test: verify `document.title` updates when `localTitle` changes in the story writer session
- [ ] Manual test: open a draft, accept a title suggestion, verify browser tab updates

## Acceptance Criteria

- [ ] Browser tab title updates within 1 second of choosing/changing a title in the Story Writer
- [ ] Draft stories show the chosen title in the tab after it's set
- [ ] Existing Jira ticket stories continue showing the Jira title
- [ ] No regressions in title display in the Story Writer header bar

## Technical Notes

- `usePageTitle` hook (`src/hooks/usePageTitle.tsx`) sets both `<title>` element (React 19 hoisting) and `document.title` (useEffect), so either approach will work
- Option B is simpler since `StoryWriterLayout` already computes the display title at line 742
- The `localTitle` is persisted in the `storyWriterSession` DB table, so it survives page refreshes
- Key files: `src/app/(app)/tickets/[key]/write/page.tsx`, `src/components/story-writer/StoryWriterLayout.tsx`, `src/hooks/usePageTitle.tsx`
