# BRDG-198: Parallelize and Conditionally Skip Post-Processing

**Status:** Done
**Priority:** Medium

## Description

As a PO using the Story Writer, I want the UI to show the AI response faster by eliminating unnecessary sequential API calls after the response arrives.

## Problem

After the SSE stream delivers a result, `applyResult()` in `useTaskMonitoring.ts:78-123` always calls three endpoints sequentially:

1. `POST /apply-draft` (parses `<story-draft>`, saves assistant message, inserts draft row)
2. `POST /apply-related` (parses `<link-suggestion>` / `<related-stories>`, saves candidates)
3. `GET /story-writer` (refreshes full session state)

This happens even when the response is a plain text answer with no draft or related story tags. The sequential execution adds 400-600ms after the AI has already responded.

## Acceptance Criteria

- [x] `apply-draft` and `apply-related` run in parallel (`Promise.all`) instead of sequentially
- [x] `apply-related` is skipped entirely when the response contains no `<link-suggestion>` or `<related-stories>` tags (check client-side before calling)
- [x] `refreshSession` runs in parallel with (or immediately after) the apply calls, not after both complete
- [x] The assistant message is still reliably saved (this currently happens inside `apply-draft`)
- [x] No regression: drafts, related stories, and session state still update correctly when tags are present
- [x] Add timing log in `applyResult()` to measure total post-processing duration

## Technical Notes

- **File:** `src/hooks/useTaskMonitoring.ts` (function `applyResult` at line 78)
- The assistant message save is currently coupled to `apply-draft`. Consider extracting it into a separate lightweight call or moving it to the background stream handler (`task-stream-handler.ts`) which already captures the result server-side.
- Client-side tag detection: simple `output.includes('<story-draft')` and `output.includes('<link-suggestion')` checks before calling the endpoints.
- `refreshSession` could potentially be replaced by optimistic state updates from the apply responses.

## Implementation Plan

1. **Add client-side tag detection** in `applyResult()` -- `output.includes('<related-stories')` and `output.includes('<link-suggestion')` checks to gate `apply-related`
2. **Parallelize apply-draft, apply-related, and refreshSession** using `Promise.all` -- fire `refreshSession` first so it runs concurrently, then `await Promise.all([applyDraftPromise, applyRelatedPromise])`, then `await refreshPromise`
3. **Conditionally skip apply-related** when neither `<related-stories>` nor `<link-suggestion>` tags are present in the output
4. **Add timing log** using `performance.now()` with `console.debug('[task-monitoring] ...')` prefix
5. **Update existing tests** to use URL-based mock matching (parallel calls break sequential `mockResolvedValueOnce`), add new test cases for conditional skip and parallel execution

### Files touched
- `src/hooks/useTaskMonitoring.ts` (steps 1-4)
- `src/hooks/useTaskMonitoring.test.ts` (step 5)

### Notes
- `apply-draft` always runs (saves assistant message), only `apply-related` is conditionally skipped
- No server-side route changes needed
- `<link-suggestion>` has no server-side parser but is checked client-side for completeness

## Dependencies

None
