# BRDG-360: Use a stable identifier for ticket reporter/assignee (not a display-name string)

**Status:** Completed
**Priority:** Medium
**Type:** Tech debt / Data integrity

## Description

People on a ticket (`reporter`, `assignee`) are stored and matched as **free-text display-name strings** ("Thijs van den Berg"). This is fragile:

- A person renamed in Jira no longer matches historical/local references.
- Two people with the same display name are indistinguishable.
- Every feature that keys on a person (team mapping, favourite users, filters, self-exclusion in the inbox, watcher candidates) matches on a brittle string.

People should be keyed on a **stable unique identifier** — Jira's `accountId` (a GUID), with email as a secondary human-readable key — instead of (or alongside) the display name. This is a cross-cutting change and is intentionally **out of scope of the New story inbox** work (BRDG-356–359), which uses name-matching as an interim.

## Current Behaviour

- `ticket.reporter` and `ticket.assignee` are `text` display names (`src/db/schema.ts`). The display objects are derived from the name via `buildAssignee` (`src/lib/user-utils.ts`), which fabricates initials + a colour from the string.
- The schema already captures **`ticket.assigneeAccountId`** during sync (harvested from issue data) because "the user-search API is outside the token's scope" — but there is **no `reporterAccountId`**, and the accountId is not the key used for matching/display.
- People-keyed features all match on the name string:
  - `userTeamAssignment` (displayName → team), `favorite-users`, watcher candidates / assignable users, board Assignee filter, inbox author/self-exclusion (BRDG-359).
- `getActingUser()` (`src/lib/acting-user.ts`) resolves the current user's Clerk name + email, but not a Jira accountId.

## Proposed Approach (sketch — to be refined)

This is a migration, not a single edit. Likely phases:

1. **Capture identity in sync.** Store `reporterAccountId` (mirroring `assigneeAccountId`) and, where available, email, during Jira sync (`src/lib/sync-tickets-service.ts`). Backfill from existing issue data where possible.
2. **Person model.** Introduce a canonical person reference (`{ accountId, displayName, email, avatar }`) — possibly a `jira_user` table — so display name becomes a label, not a key.
3. **Re-key features incrementally.** Move team assignment, favourites, filters, and self-exclusion to match on `accountId` (fall back to name while backfill is incomplete).
4. **Identity mapping for the logged-in user.** Map the Clerk user (id/email) to their Jira `accountId` so "me" comparisons (e.g. inbox self-exclude, "my work" filters) are robust. May need a per-user setting if Jira's user API stays out of token scope.

## Open Questions

- **Identifier choice:** Jira `accountId` (GUID) as the canonical key, with email + display name as labels — confirm. (accountId is the only globally stable Jira key; email can change/be hidden by privacy settings.)
- **Token/API limits:** the Jira user-search API is out of the current token's scope (per the schema comment). How much identity can we harvest from issue payloads vs. needing an API/setting? Investigate before committing to a backfill strategy.
- **Scope of re-keying:** do all people-keyed features migrate in this story, or does this story only add the identifier + a person table and later stories re-key each feature? Recommend: add the identifier + capture/backfill here; re-key features in follow-ups to keep each shippable.
- **Clerk→Jira mapping:** is there a reliable automatic mapping (email match), or does each user pick their Jira identity in a setting?

## Implementation Plan

Scope per the story's own recommendation: **add the stable identifier + capture/backfill + a canonical person-resolution utility + a proof-of-concept consumer + Clerk→Jira "me" mapping**. Full re-keying of every people-keyed feature (team assignment, favourites, filters, self-exclusion) is deferred to follow-ups so each ships independently.

**Design decisions**
- **Columns, not a `jira_user` table (yet).** Mirror the proven `assigneeAccountId` column pattern; a `jira_user` table only earns its keep once features are re-keyed (deferred). The resolver signature stays stable if a table is introduced later.
- **Clerk→Jira "me" = per-account setting, not auto email-match.** The token's user-search/`/myself` API is out of scope (`checkHealth()` deliberately avoids it). There is no server API to look up the Clerk user's Jira accountId automatically, so the robust option is a per-account setting `my_jira_identity` storing `{ accountId, email }`. Opportunistic auto-suggest from captured emails is left as an annotated future hook.

**Steps**
1. **Schema migration** (`src/db/schema.ts` `ticket` table): add nullable `reporterAccountId`, `reporterAvatar`, `reporterEmail`, `assigneeEmail`. Generate via `npm run db:generate`. No historical backfill (populates on next sync, matching how `assigneeAccountId` shipped).
2. **Capture in sync** (`src/lib/upsert-issue.ts`): extract `fields.reporter?.accountId/avatarUrls/emailAddress` and `fields.assignee?.emailAddress`; write all four into `ticketData`.
3. **Canonical person-resolution utility** (new `src/lib/person-ref.ts`): `PersonRef { accountId, displayName, email, avatar }`, `resolveReporter(row)`, `resolveAssignee(row)`, and `samePerson(a, b)` (compares by accountId → email → name). Pure functions over a ticket row.
4. **PoC consumer** (`src/lib/ticket-detail-builder.ts` line ~196): produce reporter display through `resolveReporter(t)`; output unchanged (name + avatar), data now flows through the canonical resolver.
5. **Clerk→Jira "me" mapping**: new route `src/app/api/settings/my-jira-identity/route.ts` via `createUserJsonSettingRoute`; extend `src/lib/acting-user.ts` with `getActingUserJiraAccountId()` reading the setting (null when unset → callers fall back to name).

**Tests**
- `src/lib/upsert-issue.test.ts` — sync captures `reporterAccountId`/`reporterEmail`/`reporterAvatar` from a representative payload.
- `src/lib/person-ref.test.ts` — resolution returns the stable id + label; `samePerson` unit cases; **rename scenario** (same accountId, changed display name → still same person).
- `src/app/api/settings/my-jira-identity/route.test.ts` — GET default, PUT persists, round-trip.

**Annotated / deferred:** historical backfill; `jira_user` table; auto email-match suggest; re-keying of userTeamAssignment / favorite-users / board filters / inbox self-exclusion.

## Acceptance Criteria

- [x] Tickets persist a stable reporter identifier (`reporterAccountId`) alongside the display name, captured during sync.
- [x] A canonical way to resolve a person to `{ accountId, displayName, email, avatar }` exists and is used by at least one consumer (proof of concept).
- [x] The logged-in Clerk user can be mapped to a Jira identity for "me" comparisons.
- [x] No regression: display still shows names/avatars; matching no longer breaks on a rename (demonstrated by a test).

## Tests

- [x] Sync captures `reporterAccountId` from a representative issue payload.
- [x] Person resolution returns the stable id + label from stored data.
- [x] A rename scenario: a ticket whose display name changed still resolves to the same person via accountId.

## Related

- [[BRDG-359-new-story-inbox-user-scoped-read-and-self-exclude]] — uses name-matching as an interim; switches to the stable id when this lands.
- [[BRDG-185-favorite-users-and-teams]], `userTeamAssignment`, `favorite-users` — people-keyed features that would re-key onto the identifier.
- `src/lib/acting-user.ts`, `src/lib/user-utils.ts`, `src/lib/sync-tickets-service.ts`, `ticket.assigneeAccountId`.
