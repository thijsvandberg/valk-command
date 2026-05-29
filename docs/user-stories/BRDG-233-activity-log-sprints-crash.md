# BRDG-233: Activity Log page crashes on load (sprints not iterable)

**Status:** Not Started
**Priority:** Medium
**Type:** Bug

## Description

The Activity Log page (`/activity-log`) crashes on load with `TypeError: sprints is not iterable`. The ErrorBoundary catches it and shows "Something went wrong".

## Root Cause

The page component (`src/app/(app)/activity-log/page.tsx:50-53`) fetches `/api/jira/sprints` via SWR and types the response as `Array<{ id: number; name: string }>`. However, the API (`src/app/api/jira/sprints/route.ts:81-84`) returns an object: `{ sprints: [...], backlogCount: N }`.

When SWR resolves, the `useMemo` at line 55-63 tries to iterate over the object with `for (const s of sprints)`, which fails because a plain object is not iterable.

## Acceptance Criteria

- [ ] Fix the SWR response destructuring in `src/app/(app)/activity-log/page.tsx` to extract `sprints` from the response object (e.g. `data?.sprints`)
- [ ] Activity Log page loads without errors
- [ ] Sprint names resolve correctly in the activity log entries

## Technical Notes

The fix is a one-liner: change the SWR usage to account for the wrapped response shape. Either:
- Destructure: `const { data } = useSWR<{ sprints: Array<...>; backlogCount: number }>(...)` then use `data?.sprints`
- Or use the existing `useJiraSprints` hook from `src/hooks/useSprintBoard.ts` which already handles this

## Files

- `src/app/(app)/activity-log/page.tsx` (lines 50-63)
