# BRDG-359: New story inbox — per-user read state and exclude self-authored stories

**Status:** Not Started
**Priority:** Medium
**Type:** Feature

## Description

Two related changes to the New story inbox, both keyed on "who is the logged-in user":

1. **Exclude self-authored stories.** Stories whose **author (reporter) is the logged-in user** should not appear in the inbox — you do not need to "review" what you just created.
2. **Per-user read state.** Marking a story read should be **scoped to the logged-in user**, not global. Today BRDG-356 stores read state on `ticketMetadata.newStoryReadAt`, which is shared across all users. The PO flagged this ("read moet op user niveau") and was unsure whether it is already the case — it is not.

(Rename to "New story inbox" is handled in BRDG-357.)

## Current Behaviour

- BRDG-356 stores read state in **`ticketMetadata.newStoryReadAt`** (a single shared column) and excludes only sub-tasks / drafts / removed tickets. Self-authored stories **are** shown.
- The app can already identify the current user:
  - **`getActingUser()`** (`src/lib/acting-user.ts`) returns the Clerk display name + avatar from the `x-bridge-user-id` header (e.g. "Thijs van den Berg"). The inbox already shows this exact name as an author, so it generally matches the Jira `reporter` string.
  - **`resolveUserId()`** + `readUserSetting`/`writeUserSetting` (`src/lib/user-settings.ts`, the BRDG-343 per-user foundation) key settings by `(userId, key)` in the `userSetting` table.
- There is **no explicit "my Jira display name" mapping** today (only `user-teams` maps names→team and `favorite-users`).

## Proposed Approach

### Per-user read state
- Introduce a **per-user read store** keyed by `(clerkUserId, ticketKey)`. A dedicated table (e.g. `new_story_read { userId, ticketKey, readAt }`, PK `(userId, ticketKey)`) is preferred over a JSON blob in `userSetting`, because a user may accumulate thousands of read entries and we filter the list against it.
- The list/count queries (`listNewStories`/`countNewStories`, `src/lib/new-stories-query.ts`) filter "unread" against **the current user's** read rows instead of the global column.
- Mark-as-read (`updateTicketMetadata({ newStoryRead })` + `bulkMarkNewStoriesRead`) write to the per-user store for the acting user. The mark-read API resolves the user via `resolveUserId()`.
- **Migrate off** `ticketMetadata.newStoryReadAt`: backfill any existing values to the current single user, then drop the column (or leave it unused and deprecated — confirm). Since the app is single-user today, migration impact is minimal.

### Exclude self-authored
- Resolve the logged-in user's name via `getActingUser()` and exclude rows where `reporter` equals that name from `listNewStories`/`countNewStories`.
- **Name-matching is an interim.** `reporter` is a free-text display name today, so this matches on the string. The robust fix — keying people on a stable identifier (Jira `accountId`) — is **[[BRDG-360-stable-person-identifier-reporter-assignee]]**; when that lands, switch self-exclusion to match on the id. Until then, an optional per-user "my Jira display name" override (on the `userSetting` foundation) can correct a Clerk-name/Jira-name mismatch.
- **UPDATE (BRDG-360/363/364 have landed):** the stable-identifier work is now done — `reporter.accountId` is captured on tickets, the `jira_user` directory exists, and `getActingUserJiraIdentity()` resolves the logged-in user's Jira `accountId` (per-account `my_jira_identity` setting). **Build self-exclusion directly on `accountId`** (compare `ticket.reporterAccountId` to `getActingUserJiraIdentity()?.accountId`, falling back to the name when the id is absent) instead of the name-matching interim. No separate "my Jira display name" override is needed.

## Open Questions

- **Read store shape:** dedicated `new_story_read` table (recommended) vs. JSON in `userSetting`. Default: dedicated table.
- **Drop the old column?** Remove `ticketMetadata.newStoryReadAt` after backfill, or keep it deprecated. Default: backfill to the single existing user, then remove in the same migration.
- **Self-identity source:** rely on the Clerk display name matching the Jira reporter (works today for the PO), with an optional per-user "my Jira display name" override. Confirm whether the override is needed now or deferred.
- **Self-exclusion scope:** exclude only when reporter == me, or also offer a toggle to show my own stories? Default: always exclude mine (no toggle); add a toggle later if wanted.

## Acceptance Criteria

- [ ] Stories whose reporter is the logged-in user do not appear in the inbox or the nav unread count.
- [ ] Marking a story read affects only the logged-in user; a different user still sees it as unread.
- [ ] Read state persists per user across reloads/devices (stored server-side keyed by Clerk user id).
- [ ] Existing read state from BRDG-356 is migrated to the current user (no stories silently reappear as unread for the PO).
- [ ] If the Clerk name does not match the Jira reporter, a per-user override can correct self-exclusion (or this is explicitly deferred).

## Tests

- [ ] `listNewStories` excludes rows where reporter == acting user's name.
- [ ] Read filtering is per-user: marking read for user A leaves the row unread for user B.
- [ ] Mark-as-read (single + bulk) writes to the per-user store for the resolved user id.
- [ ] Migration backfills the legacy `newStoryReadAt` values into the per-user store for the existing user.

## Related

- [[BRDG-356-newly-created-stories-inbox]] — introduced the (global) read state this re-scopes.
- [[BRDG-357-new-story-inbox-reuse-board-table]] — the rebuilt inbox; rename lives there.
- [[BRDG-343-account-scoped-saved-views]] — the per-user (`userSetting`) foundation reused here.
- `src/lib/acting-user.ts`, `src/lib/user-settings.ts`, `src/lib/new-stories-query.ts`.
