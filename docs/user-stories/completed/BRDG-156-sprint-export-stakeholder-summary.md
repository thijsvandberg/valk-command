# BRDG-156: Sprint Export with AI-Revised Stakeholder Titles

**Status:** Done
**Priority:** Medium

## Description

As the PO, I want to export selected tickets from the sprint board's multi-select as a stakeholder-friendly summary, with AI-rewritten titles that are short, non-technical, and outcome-focused (one bullet per ticket), so I can quickly share sprint progress or scope with stakeholders without manually rewriting every title.

## Current Behavior

- The BulkActionBar has a "Copy" button that copies selected tickets as `- {title} - {jiraUrl}` to the clipboard
- Titles are copied as-is from Jira, which are often technical and developer-oriented (e.g. "Refactor auth middleware to support session token rotation")
- No option to rewrite or simplify titles for a non-technical audience
- No story points included in the export
- No formatting options (just a plain list)

## Desired Behavior

### New "Export for Stakeholders" action in BulkActionBar

A new button in the bulk action bar (next to the existing "Copy" button) that:

1. Takes all selected tickets with their titles and story points
2. Sends them to an AI endpoint that rewrites each title to be:
   - Short (max ~10 words)
   - Non-technical, focused on business outcome or user impact
   - Written for stakeholders who don't read code or Jira
3. Returns a formatted summary that is copied to the clipboard

### Export format

```
Sprint {name} - Selected work ({total} pts)

- {rewritten title} ({points} pts) - {TICKET-KEY}
- {rewritten title} ({points} pts) - {TICKET-KEY}
- ...
```

### AI title rewriting

- Each title gets rewritten individually
- Context: the ticket title, story points, and optionally the epic name for additional context
- The AI should produce a single concise line per ticket, no jargon
- Example transformations:
  - "Refactor auth middleware to support session token rotation" -> "Improved login security"
  - "Add retry logic to webhook delivery pipeline" -> "More reliable notifications"
  - "Implement sprint velocity chart with burndown overlay" -> "Sprint progress dashboard"

### UX flow

1. User selects tickets on the sprint board
2. Clicks "Export for Stakeholders" in the bulk action bar
3. Button shows a loading state while AI processes titles
4. Result is copied to clipboard with a toast confirmation
5. If AI call fails, fall back to original titles with a warning toast

## Implementation Plan

1. **Add Export button** to `BulkActionBar.tsx` with `onExportForStakeholders` + `isExporting` props
2. **Wire handler** in `SprintBoard.tsx`: build payload from checked tickets, submit workspace task with skill `export-stakeholder-summary`, navigate to chat conversation
3. **VRW skill** `export-stakeholder-summary` handles AI rewriting and returns formatted result (skill lives in valk-remote-workspace)

Notes:
- AI runs via VRW workspace agent (same pattern as suggest-sprint-goal, story reviews, etc.)
- Result appears as a chat message in a conversation
- All view (no active sprint): uses "Selected work" as sprint label

## Acceptance Criteria

- [x] New "Export" button appears in BulkActionBar when tickets are selected
- [x] Clicking it sends selected ticket titles + points to an AI endpoint
- [x] AI rewrites each title to be short, non-technical, and stakeholder-friendly
- [x] Result is formatted as a bulleted list with points and ticket keys
- [x] Sprint name and total points are included in the header
- [x] Result is copied to clipboard automatically
- [x] Loading state shown on button while processing
- [x] Fallback to original titles if AI call fails
- [x] Toast confirms successful copy or shows error
- [x] Works with any number of selected tickets (1 to all)

## Technical Notes

- **AI endpoint:** Create `POST /api/ai/rewrite-titles` that accepts `{ tickets: { key, title, points, epicName }[] }` and returns `{ tickets: { key, title }[] }`
- **AI provider:** Use the existing AI utility pattern (see `/api/ai/` routes for examples)
- **Prompt strategy:** System prompt instructing concise, stakeholder-friendly rewrites. Send all titles in one batch call for efficiency.
- **BulkActionBar:** Add `onExportForStakeholders` callback prop alongside existing `onCopyToClipboard`
- **Sprint context:** The active sprint name is available from `useSprintBoard` hook
- **Key files:**
  - `src/components/sprint-board/BulkActionBar.tsx` (add button)
  - `src/components/sprint-board/SprintBoard.tsx` (wire handler)
  - `src/app/api/ai/rewrite-titles/route.ts` (new endpoint)

## Out of Scope

- Customizable export templates or formats
- Export to file (PDF, CSV) rather than clipboard
- Persisting rewritten titles back to Jira or the database
- Letting the user edit individual rewritten titles before copying
