# BRDG-365: Re-key the board Assignee filter + AssigneePicker onto the stable accountId

**Status:** Done
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

## Implementation Plan

### Design decisions
- **Dual-match token scheme.** A stored assignee filter value is the `accountId` when the person has one, else the bare display name. A ticket matches when `accountId ∈ set` OR `name ∈ set`. Covers legacy name-only filters, name-only people, and rename survival (after best-effort name→accountId migration).
- **Carry accountId on the client ticket** by adding optional `accountId?: string | null` to the `Assignee` type and threading it through `buildAssignee` (backward-compatible; name-only callers untouched). The board ticket's `assignee` is the single object every surface reads.
- Keep the dual-match inline in the filter hot path (Set membership) rather than constructing `PersonRef`s per ticket; reuse `samePerson` precedence only in the picker's `isSelected` (person-ref.ts is client-safe).

### Steps
1. **Surface accountId on the client ticket**: add `accountId?` to `Assignee` (`types/ticket.ts`), extend `buildAssignee(name, accountId?)` (`user-utils.ts`), pass `t.assigneeAccountId` at the `/api/tickets` serializer (board filter source of truth) and other serializers where cheap.
2. **Board filter re-key** (`useSprintBoardFilters.ts`): derive option tokens (`accountId ?? name`) + an `assigneeLabelMap` (token→name), dedupe so a renamed person collapses to one option; dual-match in `coreFiltered`. Leave inline search + sort on name.
3. **Names→accountId migration**: hook fetches `/api/jira/assignable-users` (SWR-deduped), builds `nameToAccountId`, and maps stored tokens at the `assigneeFilter` memo (covers both sprint + all stores); tolerate unmapped names. Apply the same transform in `handleViewClick` for saved views.
4. **FilterBar + FilterControlsPanel**: accept `assigneeLabelMap`, render the NAME for each token (never the raw accountId — the key pitfall), token-based favourite ordering. Thread the new output through `SprintBoard.tsx`.
5. **AssigneePicker**: `isSelected` becomes accountId-first with name fallback (`samePerson` precedence); selection/write path already passes the full `AssignableUser` with accountId; trigger label resolves via the jira_user-backed serialization.
6. **Tests**: update `useSprintBoardFilters`, `FilterBar`, `FilterControlsPanel`, `AssigneePicker`, `ticket-detail-builder` (buildAssignee) tests + add rename/name-fallback/migration/round-trip cases.

### Risks
- Stale SWR-cached `/api/tickets` lacking the new field → dual-match name branch keeps those filtering correctly until refetch.
- Chip/dropdown must display name, not the GUID — step 4 lands with step 2.
- Saved views holding pre-rename names need the migration transform too.

## Acceptance Criteria

- [x] The board Assignee filter matches on `assigneeAccountId` (name fallback); a renamed person is filtered consistently and appears once.
- [x] A persisted board filter holding old display names still works (migrated or tolerated), no silent empty results.
- [x] AssigneePicker keys selection on accountId with the label resolved via `jira_user`; no display regression. <!-- Label resolves via the same /api/tickets serialization the rest of the board uses; the picker selection now keys on accountId with name fallback. -->
- [x] No name-only regression: people without a captured accountId still filter/select by name.

## Tests

- [x] Board filter: rename scenario (same accountId, changed name) filters to the same person.
- [x] Board filter: name-only fallback still matches.
- [x] AssigneePicker: selection round-trips on accountId; renders the directory label.
- [x] Migration: a saved board filter with names resolves to accountIds where possible, leaves the rest as names.

## Related

- [[BRDG-360-stable-person-identifier-reporter-assignee]], [[BRDG-363-jira-user-table-and-sync-population]], [[BRDG-364-rekey-favourites-and-team-onto-accountid]] — the identifier, directory, and prior re-keys this builds on.
- [[BRDG-359-new-story-inbox-user-scoped-read-and-self-exclude]] — self-exclusion, to be built directly on accountId.
- See memory: people-identity re-key pattern (accountId-first match, name fallback; `person-ref.ts`, `jira-user-directory.ts`).
