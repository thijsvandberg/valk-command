# BRDG-264: Add a Watcher to a Story (from Single View / Story Writer)

**Status:** Not Started
**Priority:** Medium
**Type:** Feature

## Description

As a PO, I want to add (and remove) someone as a **watcher** on a story directly from the
story single view and from the Story Writer, so the right people get Jira notifications
about a ticket without me having to switch to Jira.

Watchers are a native Jira feature: any number of users can "watch" an issue to receive
update notifications. Today Bridge can set a single **assignee** but has no concept of
watchers. This story adds watcher management to the existing meta area, reusing the people
picker and Jira-write patterns already in place for assignee.

## Requirements

### 1. View current watchers

- The meta area shows the issue's current watchers as a small **avatar stack** with a
  **"+N" overflow** when there are more than fit; the full list is reachable by expanding
  the picker.
- An empty state ("No watchers") when none are set.

### 2. Add a watcher

- The user can open a people picker and select someone to add as a watcher.
- Multiple watchers are supported (unlike assignee, this is many-to-one).
- Selecting a person already watching is a no-op (or that person is hidden/marked as
  already added).
- The change is written through to Jira and reflected in the UI optimistically, with a
  rollback + toast on failure (mirror the assignee change pattern).

### 3. Remove a watcher

- The user can remove an existing watcher (e.g. an "x" on the watcher chip/row, or a
  toggle in the picker).
- Removal is written through to Jira with the same optimistic + rollback behaviour.

### 4. Available in both surfaces

- **Story single view**: watcher control lives in `TicketMetaContent` near the Assignee row.
- **Story Writer**: same control in the Meta pane (`MetaApp`), consistent with how Assignee
  appears in both places.

## Out of scope

- Showing a watcher indicator on sprint-board rows or in search results.
- Notifying watchers from Bridge itself (Jira owns notification delivery).
- "Watch this myself" as a distinct shortcut (the picker covers adding any user, including
  the current user) — can be a later enhancement.
- Bulk add/remove of watchers across multiple tickets.

## Technical notes

- **Jira API (REST v3):**
  - List: `GET /rest/api/3/issue/{key}/watchers`
  - Add: `POST /rest/api/3/issue/{key}/watchers` with the bare `accountId` string as the
    JSON body.
  - Remove: `DELETE /rest/api/3/issue/{key}/watchers?accountId={accountId}`
  - Add the corresponding methods to `src/lib/jira-client.ts` (e.g. `getWatchers`,
    `addWatcher`, `removeWatcher`), following the shape of `assignIssue` /
    `getAssignableUsers`.
- **API routes:** add routes under `src/app/api/jira/` mirroring `assign/route.ts`
  (rate limiting via `applyRateLimit("sync")`, `parseJsonBody`, `syncJiraTimestamp`,
  `errorResponse`, cache invalidation). Likely a single `watchers` route handling
  GET (list) / POST (add) / DELETE (remove), keyed by `issueKey` + `accountId`.
- **People picker:** reuse the existing `AssigneePicker` pattern / `BasePicker` and the
  `/api/jira/assignable-users` data source (favorites, team filter chips, search). Consider
  generalising into a shared `UserPicker` (multi-select / "add" mode) so both assignee and
  watchers share one implementation, rather than duplicating `AssigneePicker`.
- **Meta rendering:** both `src/components/ticket-detail/TicketMetaContent.tsx` and
  `src/components/story-writer/panes/apps/MetaApp.tsx` render the Assignee row via the
  shared picker; add the Watchers row alongside it in both.
- **Local state (decided):** do **not** persist watchers in the local DB. Fetch them on
  demand for the open ticket via the GET route; no column added to `src/db/schema.ts`.
  Revisit only if a list/board surface later needs watcher data.
- **Optimistic update:** mirror `handleAssigneeChange` in `TicketMetaContent` (snapshot
  previous, update immediately, roll back + toast on error).

## Decisions

- Watchers shown as an inline avatar stack with a "+N" overflow, expandable in the picker.
- Watchers are not stored in the local DB; fetched on demand for the open ticket.

## Implementation Plan

> Authored after codebase exploration (Opus Plan agent + verification).

### Key finding that shapes the design

`/api/jira/assignable-users` is **local-DB-only**: it returns `accountId = displayName`
and `avatarUrl = null` (no real Jira accountIds are stored anywhere in the DB). The
assignee write path passes that fake accountId straight to Jira, which would not actually
match a real Atlassian account. **Watchers cannot reuse this source**, because the Jira
"add watcher" call's body *is* the accountId — there is no displayName fallback. So the
watcher candidate list and the current-watchers list must both come from **real Jira data**
(real `accountId`s). `Avatar` renders **initials only** (no `<img>`), so missing avatar URLs
do not affect rendering; only `displayName` is needed to derive initials/color.

(The assignee inconsistency is pre-existing and out of scope; logged as an investigation.)

### Steps

1. **jira-client methods** (`src/lib/jira-client.ts`, near `assignIssue` ~L1094), all guarded
   by `isConfigured()` using existing helpers `jiraFetch`/`jiraPostNoContent`/`jiraDelete`:
   - `getWatchers(key)` → `GET /rest/api/3/issue/{key}/watchers`, map `watchers[]` to
     `{ accountId, displayName, avatarUrl }` like `getAssignableUsers`. `[]` when unconfigured.
   - `addWatcher(key, accountId)` → `POST /rest/api/3/issue/{key}/watchers` with the bare
     `accountId` JSON string body (`jiraPostNoContent` JSON-stringifies it correctly).
   - `removeWatcher(key, accountId)` → `DELETE /rest/api/3/issue/{key}/watchers?accountId=...`.
2. **API routes:**
   - `src/app/api/jira/watchers/route.ts` — `GET` (list, `issueKey` query),
     `POST` (`{issueKey, accountId}`, rate-limited, `syncJiraTimestamp`),
     `DELETE` (`issueKey`+`accountId` query). No DB writes (watchers not persisted).
   - `src/app/api/jira/watcher-candidates/route.ts` — `GET` backed by
     `jiraClient.getAssignableUsers(projectKey)` (real accountIds + avatars), enriched with
     `isFavorite`/`teams` by matching `displayName` against the local `favoriteUser` /
     `userTeamAssignment` tables (same enrichment shape as `assignable-users`).
3. **api-client** (`src/lib/api-client.ts` `jira` object): add `getWatchers(issueKey)`,
   `addWatcher({issueKey, accountId})`, `removeWatcher({issueKey, accountId})`,
   `watcherCandidatesUrl()`.
4. **WatcherPicker** (`src/components/shared/WatcherPicker.tsx`): wraps `BasePicker` like
   `AssigneePicker`, sourced from `/api/jira/watcher-candidates`. Multi-select toggle: each
   row `selected` when already a watcher (match by `accountId`); selecting toggles
   add/remove and **does not close** the popover. Reuses search + favorites + team chips.
5. **WatchersRow** (`src/components/shared/WatchersRow.tsx`): self-contained control taking
   `ticketKey` (and a `textClass` for the two surfaces). Fetches current watchers via SWR
   (`/api/jira/watchers?issueKey=...`), renders an avatar stack with `+N` overflow, an empty
   state, and the `WatcherPicker`. Owns optimistic add/remove with rollback + toast via
   `useToast`. Self-contained so **no WriterContext changes** are needed.
6. **Wire into meta surfaces:** `TicketMetaContent` (new `DetailRow label="Watchers"` after
   Assignee) and `MetaApp` (new `MetaRow label="Watchers"` in the People section).
7. **Tests:** jira-client unconfigured-mode tests; `watchers/route.test.ts` and
   `watcher-candidates/route.test.ts` (mirror `assign/route.test.ts`); `WatcherPicker.test.tsx`
   and `WatchersRow.test.tsx` (mirror `AssigneePicker.test.tsx` SWR/api-client mocking).
8. **Docs:** update `docs/architecture/jira-sync.md` with the watcher endpoints + the
   on-demand-fetch (no DB) decision + the accountId-source caveat.

## Checklist

- [x] Add `getWatchers` / `addWatcher` / `removeWatcher` to `jira-client.ts`
- [x] Add `/api/jira/watchers` route (GET/POST/DELETE) mirroring `assign`
- [x] Add `/api/jira/watcher-candidates` route (real Jira accountIds, enriched with favorites/teams)
- [x] Wire watcher methods into `api-client.ts`
- [x] Build the `WatcherPicker` (multi-select toggle wrapping `BasePicker`)
- [x] Build the `WatchersRow` (avatar stack + overflow, empty state, optimistic add/remove)
- [x] Render the Watchers row in `TicketMetaContent` (single view)
- [x] Render the Watchers control in the Story Writer `MetaApp` meta pane
- [x] Optimistic add/remove with rollback + toast on failure
- [x] Empty state when there are no watchers
- [x] Tests: jira-client methods, both API routes, and the picker/row interaction (add, remove, error rollback)
- [ ] Verify visually in both the single view and the Story Writer meta pane
- [ ] Update relevant docs (`docs/architecture/jira-sync.md`)
