# BRDG-187: Default Sprint for New Stories

**Status:** Done
**Priority:** Low

## Description

As a PO, I want to configure a default sprint for new stories so that the Story Writer pre-selects my preferred sprint instead of always defaulting to Backlog.

## Implementation Plan

1. **API route** (`src/app/api/settings/default-sprint/route.ts`): GET/PUT using `app_setting` key `"default_sprint_id"`. Returns `{ sprintId: string }`. Empty string means no preference.
2. **API client** (`src/lib/api-client.ts`): Add `settings.getDefaultSprint()` and `settings.saveDefaultSprint()`.
3. **General settings page** (`src/app/(app)/settings/general/page.tsx`): New "General" tab with a sprint dropdown. Uses SWR to load current setting + sprint slots.
4. **Register tab** (`src/app/(app)/settings/layout.tsx`): Add General as first tab. Update redirect from `/settings/jobs` to `/settings/general`.
5. **Command palette integration** (`src/components/command-palette/useCommandPalette.ts`): Fetch default sprint alongside sprint slots with `Promise.all`. Use configured sprint if it exists in slots, otherwise fall back to "Backlog" by name, then to first slot.

## Acceptance Criteria

- [x] Settings page has a "Default sprint" dropdown that lists all available sprints (same options as the New Story sprint picker)
- [x] Selected default sprint is persisted (database setting)
- [x] When creating a new story, the Sprint field is pre-populated with the configured default sprint
- [x] If the configured sprint no longer exists (e.g. closed sprint), fall back to Backlog
- [x] Setting defaults to Backlog when no preference has been set

## Technical Notes

- Add a `default_sprint` key to the existing settings/preferences storage
- The sprint list comes from the same source as the New Story dialog (Jira sprints)
- Settings page already exists; add this to the appropriate section

## Dependencies

None
