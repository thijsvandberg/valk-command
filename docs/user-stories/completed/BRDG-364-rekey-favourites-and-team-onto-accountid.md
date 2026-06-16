# BRDG-364: Re-key favourites + team assignments onto the stable accountId

**Status:** Completed
**Priority:** Medium
**Type:** Tech debt / Data integrity

## Description

Favourite users (`favorite_user`) and team assignments (`user_team_assignment`) are stored and matched on the **display-name string**. When a person is renamed in Jira, their stored favourite/team row no longer matches the ticket-derived name, so the favourite silently disappears and the team mapping breaks. This is the exact fragility BRDG-360/363 set out to fix.

This story re-keys both features onto the stable Jira `accountId` (now captured on tickets and held in the `jira_user` directory), while keeping the display name as a fallback so nothing breaks where an accountId is absent (privacy-hidden, external, or not-yet-synced people).

## Approach

1. **Schema:** add a nullable `accountId` column to `favorite_user` and `user_team_assignment`. The display name stays as a label/fallback.
2. **Write paths:** `POST /favorite-users`, `DELETE /favorite-users`, and `PUT /user-teams` accept the `accountId` (the people page already has it per user) and store it. DELETE matches by accountId when given, else by name.
3. **Matching** (`assignable-users`, `watcher-candidates`): build favourite/team lookups keyed by accountId AND by name; a person is favourite/team-assigned if either their accountId or their name matches. accountId wins, name is the fallback. Response shape is unchanged, so the many `AssignableUser` consumers are unaffected.
4. **People page + api-client:** pass `accountId` through `favoriteUsers.add/remove` and `userTeams.set`.
5. **Backfill:** resolve existing favourite/team rows' display names to an accountId via `jira_user` (best-effort; rows whose name was never seen stay name-only).

The board Assignee filter is **out of scope** (client-side filter state, cosmetic, higher client risk) — see Related.

## Acceptance Criteria

- [x] `favorite_user` and `user_team_assignment` carry a nullable `accountId`; display name retained as fallback.
- [x] Adding/removing a favourite and setting teams persists the accountId when provided.
- [x] A renamed person keeps their favourite/team status (matched by accountId), demonstrated by a test.
- [x] No regression: a name-only row (no accountId) still matches by name.
- [x] Existing favourite/team rows are backfilled with an accountId where resolvable from `jira_user`.

## Tests

- [x] favourite/team matching: accountId match wins; name fallback when no accountId.
- [x] rename scenario: favourite stored with accountId still matches after the display name changes.
- [x] write paths persist the accountId.
- [x] backfill resolves display name -> accountId via jira_user, leaves unresolved rows name-only.

## Related

- [[BRDG-360-stable-person-identifier-reporter-assignee]], [[BRDG-363-jira-user-table-and-sync-population]] — the identifier + directory this re-keys onto.
- Follow-ups: board Assignee filter re-key; AssigneePicker sending accountId natively; BRDG-359 self-exclusion built directly on accountId.
