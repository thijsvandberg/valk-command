# BRDG-185: Favorite Users and Team Management

**Status:** Done
**Priority:** Medium
**Related:** None

## Description

The AssigneePicker dropdown currently shows all Jira users in alphabetical order. In practice, only a handful of team members are assigned regularly, while the list includes service accounts, stakeholders, and people from other teams. This makes selecting the right person slower than it should be.

This story adds two features:

1. **Favorite (pinned) users** - Mark specific Jira users as favorites on the Settings page. Favorited users appear at the top of every AssigneePicker dropdown, separated from the rest by a subtle divider.

2. **Team assignments** - Assign users to one of the existing teams (BT, BM, BO, GXP, HT). These are the same teams already used for sprint prefixes in `src/lib/sprint-utils.ts`. The AssigneePicker gets a team filter so you can quickly narrow the list to a specific team.

## Implementation Plan

### Step 1: Update TEAMS constant

Add `HT` to the `TEAMS` array in `src/lib/sprint-utils.ts` (currently missing).

### Step 2: Database schema + migration

Add two new tables to `src/db/schema.ts`:

**`favoriteUser`** table:
- `id` integer PK autoincrement
- `displayName` text, not null, unique
- `createdAt` text, default now

**`userTeamAssignment`** table:
- `id` integer PK autoincrement
- `displayName` text, not null
- `team` text, not null (one of the TEAMS values: BT, BM, BO, GXP, HT)
- unique constraint on (displayName, team)

A user can belong to multiple teams. No separate team table needed since the teams are a fixed set defined in code.

Generate migration via `npm run db:generate`.

### Step 3: API routes

**Favorites:**
- `GET /api/settings/favorite-users` - List all favorite user display names
- `POST /api/settings/favorite-users` - Add a favorite (`{ displayName }`)
- `DELETE /api/settings/favorite-users` - Remove a favorite (`{ displayName }`)

**Team assignments:**
- `GET /api/settings/user-teams` - List all user-team assignments
- `PUT /api/settings/user-teams` - Set a user's teams (`{ displayName, teams: string[] }`) - replaces all team assignments for that user

### Step 4: Settings page - People tab

Add a new **People** tab to the settings layout (`src/app/(app)/settings/layout.tsx`) at path `/settings/people`.

The page shows all Jira users (from `/api/jira/assignable-users`) in a list/table with:
- A star/pin toggle per user to mark as favorite
- A team selector per user showing the 5 teams (BT, BM, BO, GXP, HT) as toggleable chips/tags
- Favorited users sorted to the top
- Search bar to quickly find a user in the list

### Step 5: Update AssigneePicker

Modify `src/components/shared/AssigneePicker.tsx`:

1. Fetch favorites and team assignments alongside assignable users (enrich the `/api/jira/assignable-users` response or parallel fetch)
2. When the dropdown opens with no search query:
   - Show favorited users first with a subtle "Favorites" section label
   - Subtle divider before the remaining users
3. Add a horizontal chip/pill row below the search input for team filtering:
   - "All" (default) + one chip per team (BT, BM, BO, GXP, HT)
   - Selecting a team filters the list to only users assigned to that team
   - Favorites section still appears at the top within a filtered view if those users belong to the selected team
4. Search works across the visible list (respects team filter)

### Step 6: API client updates

Add functions to `src/lib/api-client.ts`:
- `getFavoriteUsers()`, `addFavoriteUser(displayName)`, `removeFavoriteUser(displayName)`
- `getUserTeamAssignments()`, `setUserTeams(displayName, teams)`

### Step 7: Tests

- API route tests for favorite-users CRUD
- API route tests for user-teams PUT/GET
- AssigneePicker component tests verifying favorites appear first and team filter works
- Settings People page rendering tests

## Acceptance Criteria

### Favorites

- [x] New `favoriteUser` table exists with migration
- [x] Settings > People page shows all Jira users with a favorite toggle
- [x] Toggling favorite persists to the database
- [x] AssigneePicker shows favorited users at the top, separated by a divider
- [x] Favorites section has a subtle label ("Favorites" or star icon)
- [x] Favorited users do NOT appear again in the main list below (no duplicates)

### Team assignments

- [x] New `userTeamAssignment` table exists with migration
- [x] Settings > People page shows team chips per user (BT, BM, BO, GXP, HT)
- [x] Toggling a team chip persists the assignment to the database
- [x] A user can belong to multiple teams
- [x] AssigneePicker shows team filter chips below the search input
- [x] Selecting a team chip filters the user list to that team's members
- [x] "All" chip resets to the full list

### General

- [x] `HT` is added to the `TEAMS` constant in `src/lib/sprint-utils.ts`
- [x] Search works correctly in all filter states
- [x] "Unassigned" option always remains visible at the top
- [x] No regressions in existing assignee selection behavior
- [x] All new API routes have tests
- [x] Component tests cover favorites and team filter behavior

## Technical Notes

- Teams are the fixed set from `src/lib/sprint-utils.ts`: BT, BM, BO, GXP, HT. These map to Jira sprint prefixes. No UI for creating/deleting teams.
- Users are identified by `displayName` (string) since the current Jira sync does not store `accountId`.
- The AssigneePicker is the only user selection component in the app (`src/components/shared/AssigneePicker.tsx`). The FilterBar on the sprint board uses a generic FilterDropdown that could benefit from the same favorites logic later, but is out of scope here.
- Keep the combined data fetch efficient: consider enriching the existing `/api/jira/assignable-users` response with `isFavorite` and `teams[]` per user to avoid waterfall requests in the picker.
