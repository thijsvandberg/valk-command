# BRDG-365: Re-key the board Assignee filter + AssigneePicker onto the stable accountId

**Status:** Not Started
**Priority:** Low
**Type:** Tech debt / Data integrity

## Description

The last two people-keyed surfaces still match on the **display-name string**:

1. **Board Assignee filter** (`src/components/sprint-board/useSprintBoardFilters.ts` and the `FilterBar`/`FilterControlsPanel`/`SprintBoard` chrome) — filters tickets by assignee name, and the chosen filter is persisted in the board-filters setting. A Jira rename breaks the saved filter and a renamed person can appear under two filter chips.
2. **AssigneePicker** (`src/components/shared/AssigneePicker.tsx`) — selects/assigns by the display name surfaced from `/api/jira/assignable-users`. The accountId is already on each `AssignableUser`, but the picker keys its UI state and persistence on the name.

This finishes the people-identity migration started in **[[BRDG-360-stable-person-identifier-reporter-assignee]]** / **[[BRDG-363-jira-user-table-and-sync-population]]** and continued in **[[BRDG-364-rekey-favourites-and-team-onto-accountid]]**. It is deliberately separate because both surfaces are **client-side state + persisted filter settings**, so they carry migration risk (stale saved filters) and need visual verification — unlike the backend re-keys in 364.

## Current Behaviour

- `ticket.assigneeAccountId` is captured on every ticket (BRDG-360) and the `jira_user` directory resolves accountId → label (BRDG-363); the board filter and picker do not use either.
- Board filter state stores assignee display names; matching is `ticket.assignee === selectedName`.
- AssigneePicker carries `accountId` per option (from `assignable-users`) but persists/compares on `displayName`.

## Proposed Approach (to refine)

1. **Board filter:** store the selected assignee as `accountId` (fall back to name for people without one). Match tickets via `ticket.assigneeAccountId` first, name fallback. Migrate any persisted board-filter setting that holds names to accountIds (best-effort via `jira_user`), and tolerate legacy name entries.
2. **AssigneePicker:** key selection/state on `accountId` (already present on each option), display the label via the `jira_user`-backed resolver. Keep name fallback for null-accountId people.
3. **Resolver reuse:** use `resolveAssignee` / `samePerson` (`src/lib/person-ref.ts`) and `getJiraUserLookup` (`src/lib/jira-user-directory.ts`) rather than new matching logic.
4. **Visual verification:** confirm the board filter chips, counts, and the picker render identically and that a renamed person collapses to a single entry.

## Acceptance Criteria

- [ ] The board Assignee filter matches on `assigneeAccountId` (name fallback); a renamed person is filtered consistently and appears once.
- [ ] A persisted board filter holding old display names still works (migrated or tolerated), no silent empty results.
- [ ] AssigneePicker keys selection on accountId with the label resolved via `jira_user`; no display regression.
- [ ] No name-only regression: people without a captured accountId still filter/select by name.

## Tests

- [ ] Board filter: rename scenario (same accountId, changed name) filters to the same person.
- [ ] Board filter: name-only fallback still matches.
- [ ] AssigneePicker: selection round-trips on accountId; renders the directory label.
- [ ] Migration: a saved board filter with names resolves to accountIds where possible, leaves the rest as names.

## Related

- [[BRDG-360-stable-person-identifier-reporter-assignee]], [[BRDG-363-jira-user-table-and-sync-population]], [[BRDG-364-rekey-favourites-and-team-onto-accountid]] — the identifier, directory, and prior re-keys this builds on.
- [[BRDG-359-new-story-inbox-user-scoped-read-and-self-exclude]] — self-exclusion, to be built directly on accountId.
- See memory: people-identity re-key pattern (accountId-first match, name fallback; `person-ref.ts`, `jira-user-directory.ts`).
