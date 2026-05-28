# BRDG-214: Refinement Session UX Improvements

**Status:** In Progress
**Priority:** High
**Related:** [BRDG-170](completed/BRDG-170-refinement-session-v2.md), [BRDG-182](completed/BRDG-182-refinement-session-ui-polish.md)

## Description

A collection of UX improvements discovered during real refinement sessions. These are small but impactful friction points that slow down the refinement workflow.

## Implementation Plan

1. **Subtask input whitespace (item 4)** - Remove extra padding above the "Add subtask" input in `SubtasksSection.tsx`. Pure CSS fix.
2. **AI suggestion default visibility (item 5)** - Add `suggestionsVisible` state in `SubtasksSection.tsx`, gate `<SubtaskSuggestions>` behind it, set true only when spark button is clicked or generation completes.
3. **Subtask filter persistence (item 3)** - Replace `useState<StatusFilter>("all")` with `useLocalStorage` in `SubtasksSection.tsx`. The `useLocalStorage` hook already exists in the codebase.
4. **Configurable issue pill (item 1)** - Add `useSectionVisibility("refinement-pill", ...)` in `RefinementTicketList.tsx`, add gear icon popover with toggles, thread `showKey`/`showStatus` props to `TicketRow` and `SortableQueueItem`, add section to `VALID_SECTIONS`.
5. **Subtask sync pull button (item 2)** - Add "Pull from Jira" button in subtask section overflow menu, call single-ticket sync API, add SWR refresh interval for automatic updates.
6. **Comment images (item 6)** - Apply the same `filenameToId` attachment resolution to comment content in the ticket detail API route (currently only applied to descriptions). Handle wiki markup `!image.png!` format as fallback.

All items are independent with no cross-dependencies.

## Acceptance Criteria

### 1. Configurable issue pill (type/status display)

- [x] The issue pill (TicketKeyPill / TicketStatusPill) in the refinement ticket list and queue should allow toggling which metadata is visible (issue type icon, status label)
- [x] Add a view settings control (e.g. in the filter panel or a small gear icon) where the user can choose what to show on the pill: type icon, status label, or both
- [x] Setting persists across page navigations (use existing `useSectionVisibility` pattern or similar persistence)

### 2. Streaming subtask sync during refinement

- [x] When subtasks are created in Jira (e.g. by an agent), they should appear in the ticket detail view as soon as the next sync brings them in, without requiring a manual page refresh
- [x] If subtasks were already created in Jira before the ticket was opened in Bridge, they must appear immediately after the initial data load
- [x] Add a manual "Pull from Jira" button (e.g. behind the `...` overflow menu on the subtask section header) to trigger an on-demand sync for the current ticket's subtasks
- [x] The pull action should show a brief loading indicator while fetching

### 3. Subtask filter persistence

- [x] The subtask status filter (TO DO / IN PROGRESS / DONE) must persist its value so it is remembered when navigating between tickets and when returning to the refinement page
- [x] Use the same persistence mechanism as field visibility (`useSectionVisibility` or a parallel `useSectionFilter` stored in the DB/localStorage)
- [x] Default remains "all" for first-time use

### 4. Subtask input field whitespace

- [x] Remove the unnecessary whitespace/padding above the "Add subtask" input field in the SubtasksSection
- [x] The input should sit flush against the last subtask row (or section header if no subtasks exist)

### 5. AI suggestion block default visibility

- [x] The AI suggestion block in the ticket detail (SubtaskSuggestions) should be hidden by default
- [x] Only show the suggestion block after the user explicitly clicks the spark/AI button to generate suggestions
- [x] Once suggestions have been generated, the block remains visible until the user collapses it or navigates away

### 6. Comment images and completeness

- [x] Verify that Jira comments with embedded images render correctly in the CommentsSection
- [x] Images in comments should use the same `renderMarkdown` pipeline that handles images in descriptions (which already supports `/api/attachments/` URLs and `ImageLightbox`)
- [x] If Jira comment bodies reference attachments via Jira's internal media format (e.g. `!image.png|thumbnail!`), convert these to the resolvable `/api/attachments/` URL format during sync
- [ ] Test with VPL-1337 which has image-containing comments <!-- skipped: requires live Jira data, must be verified manually in the browser -->
- [x] Ensure long comments are fully rendered (no truncation unless explicitly collapsed)

## Technical Notes

- **Issue pill config:** The `TicketKeyPill` already accepts `statusLabel`/`statusBg`/`statusColor` props. The refinement list uses `TicketStatusPill` which wraps it. The change is about making these toggleable by the user.
- **Subtask sync:** The existing SWR cache invalidation should handle this if the ticket data is re-fetched. Consider adding a targeted mutate on the subtask endpoint or a manual refresh button.
- **Filter persistence:** The `useSectionVisibility` hook already persists field toggles to the DB via `getSectionVisibility`/`saveSectionVisibility`. The status filter uses plain `useState("all")` and is lost on unmount. Extend the persistence pattern to include filter state.
- **Comment images:** `renderMarkdown` already handles `![alt](/api/attachments/...)` with `ImageLightbox`. The gap is likely in the Jira sync layer: Jira wiki markup for images (`!filename.png!`) may not be converted to markdown image syntax when syncing comments. Check `jira-client.ts` and the comment sync logic.
