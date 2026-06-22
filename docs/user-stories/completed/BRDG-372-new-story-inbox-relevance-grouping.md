# BRDG-372: New story inbox — "Relevance" grouping (team-first relevance ladder)

**Status:** To Do
**Priority:** Medium
**Type:** Feature

## Description

The New story inbox can group by Date / Epic / Creator / Sprint (BRDG-358). The PO wants a fifth group-by mode, **Relevance**, that orders incoming stories by how relevant they are to *me and my team* instead of by a flat attribute. The order surfaces "my turf" first and sinks work another PO already owns to the bottom.

The relevance ladder (top = most relevant, first-match-wins, each row lands in exactly one bucket):

1. **On your team's board** — on one of my team's sprints or my team's backlog, created by someone who is *not* a teammate.
2. **From your teammates** — created by a member of my team (anywhere).
3. **Generic backlog** — sits on the generic project backlog (no sprint).
4. **Everything else** — the remaining rows, *not* created by a PO.
5. **From other POs** — the remaining rows created by another PO (sink to the bottom).

Note the 4/5 split: a PO-created row is **not** force-demoted. If it matches buckets 1–3 it stays there; bucket 5 only catches PO-created rows that would otherwise fall into "Everything else". (Confirmed with PO.)

**Activation:** a fifth option in the existing inbox group-by dropdown. No new view or top-level control. Each ladder rung renders as a collapsible board-style group, reusing the existing `GroupCard`/`GroupStatBar`.

## Current Behaviour

- Inbox group-by lives in `useInboxGroupBy` (`src/components/sprint-board/useInboxGroupBy.ts`) with pure grouping in `src/lib/new-stories-grouping.ts`. `InboxGroupBy = "date" | "epic" | "creator" | "sprint"`; `groupInboxStories(rows, { groupBy, now })` returns `InboxGroup { key, label, rows }`. Choice + collapsed state persist under session keys `inbox-group-by` / `inbox-collapsed-groups`.
- The inbox already excludes rows authored by the current user (BRDG-359), so "From other POs" is inherently about *other* POs.
- **My team** is the "Default team" setting: `userSetting` key `default_team`, route `/api/settings/default-team`, hook `useDefaultTeam()` → `{ defaultTeam: Team | null }`. Can be `null` (None).
- **Team membership** of a person comes from `userTeamAssignment` (`displayName`, `accountId`, `team`), surfaced via `/api/settings/user-teams`. `buildTeamMap()` / `resolveTeam()` in `new-stories-grouping.ts` already map a reporter to their teams.
- **Sprint/backlog classification** helpers already exist in `src/lib/sprint-utils.ts`: `extractTeamPrefix(name)` and `isBacklogSprintName(name)`. Generic backlog = `sprintName == null`. No new naming logic should be written.
- **PO marker does not exist.** No role/flag on any person today.

## Proposed Approach

### PO marker (new, prerequisite data)

Model "is a PO" as a per-person flag keyed on **Jira accountId** (consistent with the BRDG-360/363/364 re-key to accountId), following the `favoriteUser` pattern end-to-end:

- New table `poUser` (`id`, `account_id`, `display_name`, `created_at`; unique on `account_id`) + drizzle migration. (A dedicated table mirrors `favoriteUser` and keeps it decoupled from team assignments.)
- Route `/api/settings/po-users` (GET list / POST add / DELETE remove), mirroring `/api/settings/favorite-users`, plus an `api-client.ts` `poUsers` helper.
- On **Settings > Team** (`src/app/(app)/settings/people/page.tsx`), add a second per-person toggle **separate from the favorite star**: a lucide **`BadgeCheck`** icon, violet (filled when active) so it never reads as the amber favorite star. Surface `isPo` on each row from `/api/jira/assignable-users` alongside `isFavorite`.
- The PO marker is independent of the favorite star and of team chips.

### Relevance helper (pure, single source of truth)

Add one pure classifier so the UI stays dumb and the logic is not duplicated:

```
RELEVANCE_BUCKETS = ["team_board", "teammates", "generic_backlog", "everything_else", "other_pos"]
classifyInboxRelevance(row, { myTeam, teamMap, poAccountIds }): RelevanceBucket
```

Built from existing helpers:
- `team_board`: `extractTeamPrefix(row.sprintName) === myTeam` (covers both my team's numbered sprints and `isBacklogSprintName` "MyTeam: Backlog") **and** the reporter is not on `myTeam`.
- `teammates`: reporter's teams (via `teamMap`) include `myTeam`.
- `generic_backlog`: `row.sprintName == null`.
- `other_pos`: reporter's accountId is in `poAccountIds`.
- `everything_else`: fallback.

Evaluation order = ladder order, except `other_pos` is checked **after** 1–3 but **before** `everything_else` — i.e. order is `team_board → teammates → generic_backlog → (other_pos vs everything_else)`. PO rows that already matched 1–3 keep their bucket.

### Grouping mode

- Extend `InboxGroupBy` with `"relevance"`. In `groupInboxStories`, when `groupBy === "relevance"`, group by `classifyInboxRelevance` and order groups by `RELEVANCE_BUCKETS`; drop empty buckets. Within a bucket keep the existing default sort (newest first).
- `groupInboxStories` needs the extra inputs (`myTeam`, `teamMap`, `poAccountIds`) for this mode only; thread them through `useInboxGroupBy` (it already has access to team data paths used by the team-first ordering).
- Add `"relevance"` to the inbox group-by dropdown with label **"Relevance"**.

### Group header labels

Locked: **On your team's board** / **From your teammates** / **Generic backlog** / **Everything else** / **From other POs**.

### No default team set

If `defaultTeam` is `null` (None), the Relevance option is **not shown** in the dropdown (it has no meaning without "my team"). If it was the persisted choice and the team is later cleared, fall back to `date`.

## Implementation Plan

Decided (Opus Plan + codebase verification).

**Phase 1 — PO marker persistence (AC5, foundation for AC4)**
1. `src/db/schema.ts` — add `poUser` table after `favoriteUser`: `id` (text PK), `accountId` (text), `displayName` (text notNull), `createdAt` (default `datetime('now')`), unique index on `accountId`. Export `PoUserRow`.
2. Generate migration with `npm run db:generate` (drizzle-kit emits next `00XX_*.sql`). Do not hand-write.
3. `src/app/api/settings/po-users/route.ts` (new) — mirror `favorite-users/route.ts` (GET/POST/DELETE, rate-limit, zod), swapping `favoriteUser` → `poUser`.
4. `src/lib/api-client.ts` — add `poUsers` helper mirroring `favoriteUsers`.

**Phase 2 — surface `isPo` (AC5 display, feeds AC4)**
5. `src/app/api/jira/assignable-users/route.ts` — add a `poUser` join mirroring the favorites block; emit `isPo` per user (by accountId or name).
6. `src/app/(app)/settings/people/page.tsx` — add `isPo` to `AssignableUser`; `handleTogglePo` mirroring `handleToggleFavorite`; render a second toggle using lucide `BadgeCheck` (violet, filled when active), visually separate from the star.

**Phase 3 — relevance classifier (AC3, AC4, AC7)**
7. `src/lib/new-stories-grouping.ts` — add `RelevanceBucket`, `RELEVANCE_BUCKETS`, label map, and `classifyInboxRelevance(row, { myTeam, teamMap, poAccountIds })`. Order: `team_board` (`extractTeamPrefix(sprintName)===myTeam` and reporter not on myTeam) → `teammates` (reporter teams include myTeam) → `generic_backlog` (`sprintName==null`) → (`other_pos` if reporter in poAccountIds else `everything_else`). Reuse `extractTeamPrefix`/`resolveTeam`; no new naming regex (AC7).
8. Same file — extend `InboxGroupBy` with `"relevance"`; add `myTeam`/`teamMap`/`poAccountIds` to options; `case "relevance"` buckets by classifier, emits in `RELEVANCE_BUCKETS` order, drops empty, preserves newest-first (AC2).

**Phase 4 — wiring (AC1, AC2, AC6)**
9. `src/components/sprint-board/useInboxGroupBy.ts` — accept relevance inputs; derive `effectiveGroupBy = groupBy === "relevance" && !myTeam ? "date" : groupBy` (AC6, storage untouched); thread into `groupInboxStories`.
10. `src/app/(app)/inbox/page.tsx` — fetch `useDefaultTeam()`, team assignments (`buildTeamMap`), `poUsers.list()`; pass into `useInboxGroupBy`; pass `defaultTeam` to the dropdown.
11. `src/components/sprint-board/InboxGroupByDropdown.tsx` — add `{ value: "relevance", label: "Relevance" }`; hide it when no default team (AC1, AC6).

**Upstream fix (unblocks AC4):** `src/lib/new-stories-query.ts` — pass `t.reporterAccountId` into `buildAssignee` so `reporter.accountId` is populated; match POs by accountId and name.

**Tests:** `src/lib/new-stories-grouping.test.ts` (classifier + relevance ordering); `src/components/sprint-board/useInboxGroupBy.test.ts` (persistence + no-team fallback); `src/app/api/settings/po-users/route.test.ts` (round-trip on accountId).

## Acceptance Criteria

- [x] The inbox group-by dropdown offers a fifth option, **Relevance**, when a default team is set. <!-- InboxGroupByDropdown showRelevance -->
- [x] In Relevance mode rows are grouped into the five buckets in ladder order, empty buckets hidden, newest-first within a bucket. <!-- groupByRelevance -->
- [x] A row on my team's sprint/backlog by a non-teammate lands in "On your team's board"; a row by a teammate lands in "From your teammates"; a no-sprint row lands in "Generic backlog". <!-- classifyInboxRelevance -->
- [x] A PO-created row that also matches buckets 1–3 stays in that bucket; a PO-created row that would otherwise be "Everything else" lands in "From other POs". <!-- classifyInboxRelevance order -->
- [x] I can mark a person as a PO on Settings > Team, independently of the favorite star, and it persists (keyed on accountId). <!-- poUser + BadgeCheck toggle -->
- [x] When no default team is set, the Relevance option is hidden and the inbox falls back to date grouping. <!-- dropdown filter + useInboxGroupBy effectiveGroupBy -->
- [x] Sprint/backlog classification reuses `sprint-utils` helpers (no new naming regex); the Sprint Board is unaffected. <!-- extractTeamPrefix reused; only inbox files touched -->

## Tests

- [x] `classifyInboxRelevance` returns the correct bucket for each ladder case, including the PO-stays-in-natural-bucket and PO-sinks-to-bottom cases. <!-- new-stories-grouping.test -->
- [x] `groupInboxStories` relevance mode orders buckets per `RELEVANCE_BUCKETS` and hides empty ones. <!-- new-stories-grouping.test -->
- [x] `useInboxGroupBy` persists `relevance` under the inbox key and is ignored/falls back when default team is null. <!-- useInboxGroupBy.test -->
- [x] PO marker API round-trips (add/remove) keyed on accountId, separate from favorites. <!-- po-users/route.test; Team toggle is a thin wrapper over poUsers.add/remove, mirroring the untested favorite toggle -->

## Related

- [[BRDG-358-new-story-inbox-grouping-and-group-actions]] — the group-by modes this extends.
- [[BRDG-356-newly-created-stories-inbox]] — original inbox + team-first ordering / default team.
- [[BRDG-359-new-story-inbox-user-scoped-read-and-self-exclude]] — self-exclusion (why this is "other" POs).
- [[BRDG-360-stable-person-identifier-reporter-assignee]] / [[BRDG-364-rekey-favourites-and-team-onto-accountid]] — accountId identity (PO marker follows this).
- Helpers: `extractTeamPrefix`, `isBacklogSprintName` (`src/lib/sprint-utils.ts`); `buildTeamMap`/`resolveTeam` (`src/lib/new-stories-grouping.ts`); `favoriteUser` pattern (`/api/settings/favorite-users`, Settings > Team).
