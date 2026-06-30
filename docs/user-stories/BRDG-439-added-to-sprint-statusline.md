# BRDG-439: "Added to sprint" statusline on the board row

**Status:** To Do
**Priority:** Medium
**Type:** Feature

## Description

When a ticket is moved into (or created directly in) the **active sprint**, the PO wants the board row to surface a quiet statusline beneath it, exactly like the existing BRDG-414 status-change line:

> Added to sprint by Frank van den Nouland just now

Trigger condition: the ticket is now in the active sprint and there is an unseen "added to this sprint" event for it. **The ticket's current Jira status does not matter** — a ticket added straight into "To Do" still shows the line.

If the *same* move also carried a status transition (the common drag-from-backlog case, where a single Jira changelog entry adds the sprint **and** flips the status), the two are **combined into one sprint-led sentence**:

> Added to sprint and moved from To Do to In Progress by Frank van den Nouland just now

When there is no status change, only the first form shows. The line reuses the existing line's dismiss checkmark, relative-time, and per-user "seen" behaviour, so one dismiss clears the whole combined line.

Decisions confirmed with the PO:
- **Combined wording:** sprint-led single sentence ("Added to sprint and moved from X to Y by …").
- **Scope of tickets:** show for *any* ticket that lands in the active sprint, **including newly-created tickets** (not only tickets dragged in from elsewhere).

## Current Behaviour

The line in the PO's screenshot is the **BRDG-414 status-change review queue**:

- Render: `src/components/sprint-board/StatusChangeLine.tsx` — renders `Updated from <from> to <to> by <changedBy> <relativeTime>` plus a dismiss checkmark, mounted inside the row surface at `src/components/sprint-board/BoardRow.tsx:1036-1045`.
- Data type: `StatusChangeItem` in `src/lib/status-changes-query.ts:22-37`.
- Query: `listUnseenStatusChanges()` (`src/lib/status-changes-query.ts:48-181`) — one line per ticket, the latest **unseen** transition whose `toStatus === ticket.status`, scoped to the active sprint's ticket keys.
- Persistence: `ticketStatusChange` table (`src/db/schema.ts:890-907`) carries `fromStatus`/`toStatus` (`toStatus` is **`notNull`**), `changedAt`, and the changelog actor trio `changedBy`/`changedByAccountId`/`changedByAvatar`. Per-user "seen" state lives in `statusChangeSeen` (`src/db/schema.ts:916-922`), keyed on `(userId, statusChangeId)` with an **opaque** change id (no FK).
- Real-time write: `src/lib/upsert-issue.ts:378-391` inserts a `ticketStatusChange` row when `statusChanged`, using `extractLastStatusChangeAuthor(issue)` (`src/lib/jira-client.ts:660-675`) for the actor + Jira event time, with a deterministic id (`sc-<key>-<eventTimeMs>`) + `onConflictDoNothing` so it dedupes against the burnup-seed backfill.
- Hook: `useStatusChanges()` (`src/hooks/useStatusChanges.ts`) — SWR + live `ticket`-event revalidation on kinds `status`/`comment`/`content`; exposes `byKey`, `markSeen(id)`, `markAllSeen()`.
- Seen API: `src/app/api/status-changes/seen/route.ts` (PUT one id / POST many ids); the queue endpoint is `src/app/api/status-changes/route.ts`.

Sprint membership and sprint-add events today:
- Membership: `ticket.sprintName` (primary/active sprint label) + `ticket.sprintIds` (JSON array) — `src/db/schema.ts:69-73`. Sprint state (`active`/`future`/`closed`) is cached in `appSetting` key `jira_sprints` and read as `s.state === "active"` (e.g. `src/lib/jira-client.ts:574`, `src/lib/epic-progress.ts:38`).
- Sprint changes are detected in `upsert-issue.ts:274` (`changedKinds.add("sprint")`) and emitted as a `"sprint"` ticket event (`upsert-issue.ts:578`), **but no actor or review-queue row is written** for them.
- The only sprint-add record today is `ticketScopeChange` (`src/db/schema.ts:927-937`): `action: "added" | "removed"`, `changedAt`, `storyPoints`, `businessValue` — **no actor columns**, and it is written **only** by the burnup-seed backfill (`src/app/api/burnup/seed/route.ts:184-262`), not in real time. It feeds the burnup scope line.
- The changelog *does* carry who changed the Sprint field: `filterSprintChanges()` (`src/lib/jira-client.ts:1944-1958`) parses `field === "Sprint"` items (from/to sprint lists + `changedAt`) but **drops the author**. There is no `extractLastSprintChangeAuthor` yet.

**Gap:** sprint-add events have no actor and no per-user review-queue representation, so there is nothing to render an "Added to sprint by …" line from.

## Proposed Approach

Treat "added to active sprint" as a second kind of review-queue item that merges into the **same single board line** as the status change, reusing the BRDG-414 plumbing end-to-end. Behaviour-driven; the persistence choice below is the recommended default and may be adjusted by the implementer.

**1. Capture the actor for sprint-adds (write side).**
- Add `extractLastSprintChangeAuthor(issue)` in `src/lib/jira-client.ts` next to `extractLastStatusChangeAuthor` (`:660`): walk `changelog.histories` newest-first, return the first entry that has a `field === "Sprint"` item whose `toString` adds a sprint the `fromString` did not contain → `{ name, accountId, avatar, changedAt }`. Returns null when no inline sprint-add history exists.
- Extend `ticketScopeChange` (`src/db/schema.ts:927`) with the actor trio `changedBy` / `changedByAccountId` / `changedByAvatar` (all nullable). New Drizzle migration in `drizzle/`. This reuses the table the burnup chart already consumes rather than adding a new one.
- In `src/lib/upsert-issue.ts`, when the ticket's sprint membership newly includes a sprint (the `existing.sprintName !== ticketData.sprintName || existing.sprintIds !== ticketData.sprintIds` branch at `:274`, **and** the brand-new-ticket path where `!existing`), write a `ticketScopeChange` row `action: "added"` with a deterministic id matching the burnup-seed scheme (`scope-<key>-add-<eventTimeMs>`) + `onConflictDoNothing`, carrying the actor from `extractLastSprintChangeAuthor(issue)`.
  - **Attribution fallback for newly-created tickets** (no Sprint changelog entry exists): use the ticket's `reporter`/`reporterAccountId`/`reporterAvatar` and `jiraCreatedAt` as actor + time. If even that is unknown, write a null actor (line renders "Added to sprint just now").
- Do **not** filter by active-sprint state at write time — write the scope-add for any sprint-add and let the read side scope to the active sprint (mirrors how status changes are written always and filtered on read).

**2. Merge sprint-adds into the review-queue line (read side).**
- In `src/lib/status-changes-query.ts`, extend the per-ticket result so each `StatusChangeItem` can carry an optional `sprintAdded: { id; changedBy; changedByAccountId; changedByAvatar; changedAt } | null`, fetched as the latest **unseen** `ticketScopeChange` (`action = "added"`) for the active-sprint ticket keys, joined against `ticket.sprintName` so it only shows while the ticket is still in the current sprint. Reuse `statusChangeSeen` for the unseen check (its id is opaque, so a `scope-…` id coexists with `sc-…` ids).
- A ticket now qualifies for a line if it has an unseen status change **or** an unseen sprint-add (today it needs the status change). Keep "one line per ticket".

**3. Render the combined / sprint-only sentence.**
- In `StatusChangeLine.tsx`, compose the lead clause from the item:
  - sprint-add only → `Added to sprint by {actor} {relativeTime}`
  - status change only → unchanged (`Updated from X to Y by …`)
  - both → `Added to sprint and moved from {from} to {to} by {actor} {relativeTime}` (sprint-led).
- When both are present, use the **sprint-add actor + time** as the single attribution (sprint-add is the trigger). The existing trailing signals (new comments, story-edited, deploy, subtask flag, Move-to-bottom / Generate-test-prompt actions, dismiss checkmark) are unchanged.

**4. Dismiss clears the whole line.**
- The single checkmark must mark **both** underlying ids seen (the status-change id and/or the sprint-add id). Extend `markSeen` in `useStatusChanges.ts` + the `seen` API to accept the set of ids carried by the item (or accept the item), so dismissing a combined line never leaves a half-line behind.
- Add `"sprint"` to the hook's `REVALIDATE_KINDS` (`useStatusChanges.ts:12`) so a live sprint event refreshes the queue on an open board.

**Non-goals / out of scope:**
- "Removed from sprint" lines (this story is added-only).
- Future-sprint adds surfacing before that sprint becomes active (the board only queries the active sprint).
- Any change to the burnup scope line or its backfill beyond the added actor columns.
- People-table resolution of the actor name — show the Jira changelog/reporter display name as-is (consistent with BRDG-414).

## Implementation Plan

1. **Schema + author extractor.** Add actor columns to `ticketScopeChange` (+ migration); add `extractLastSprintChangeAuthor()` to `jira-client.ts` with a unit test.
2. **Write side.** In `upsert-issue.ts`, write the `ticketScopeChange` "added" row (with actor / reporter fallback) on sprint-add for both existing and new tickets; dedupe via deterministic id + `onConflictDoNothing`.
3. **Read side.** Extend `status-changes-query.ts` to attach `sprintAdded` per ticket and qualify tickets with only a sprint-add; thread the type through `StatusChangeItem`.
4. **Render + dismiss.** Update `StatusChangeLine.tsx` for the three sentence variants; extend `useStatusChanges.ts` + `seen` API so one dismiss clears both ids; add `"sprint"` to `REVALIDATE_KINDS`.

## Acceptance Criteria

- [ ] A ticket newly in the active sprint shows a board line `Added to sprint by <actor> <relative-time>`, regardless of its current status. <!-- StatusChangeLine.tsx sprint-only variant; status-changes-query.ts qualifies sprint-add-only tickets -->
- [ ] When the same move also changed status, the line reads `Added to sprint and moved from <from> to <to> by <actor> <relative-time>` (one combined, sprint-led line — not two lines). <!-- StatusChangeLine.tsx combined variant -->
- [ ] Newly-created tickets that land directly in the active sprint also show the line, attributed to the reporter at the created time when no Sprint changelog entry exists. <!-- upsert-issue.ts new-ticket path + reporter/jiraCreatedAt fallback -->
- [ ] The actor name for a moved ticket comes from the Jira "Sprint" changelog entry's author. <!-- extractLastSprintChangeAuthor() in jira-client.ts -->
- [ ] The single dismiss checkmark marks the whole line seen (both the status-change and sprint-add ids); the line does not reappear and no half-line remains. <!-- useStatusChanges.markSeen + /api/status-changes/seen -->
- [ ] The line appears on an already-open board without a manual refresh when a sprint event arrives. <!-- "sprint" added to REVALIDATE_KINDS in useStatusChanges.ts -->
- [ ] The line only shows while the ticket is still in the active sprint, and only for the active sprint's tickets. <!-- status-changes-query.ts scope: active-sprint keys + join on ticket.sprintName -->
- [ ] The burnup scope line and its backfill are unchanged apart from the new (nullable) actor columns. <!-- ticketScopeChange columns are additive; burnup/seed/route.ts unaffected -->

## Tests

- [ ] `extractLastSprintChangeAuthor` returns the author/time of the latest Sprint-add changelog entry and null when none/created-without-changelog. <!-- src/lib/jira-client.test.ts -->
- [ ] `upsert-issue` writes a `ticketScopeChange` "added" row with the changelog actor on a sprint-add for an existing ticket, and with the reporter fallback for a new ticket; re-running the same sync does not duplicate it. <!-- src/lib/upsert-issue.test.ts -->
- [ ] `listUnseenStatusChanges` attaches `sprintAdded` and qualifies a ticket that has only an unseen sprint-add; hides it once seen or once the ticket leaves the sprint. <!-- src/lib/status-changes-query.test.ts -->
- [ ] `StatusChangeLine` renders the sprint-only, status-only, and combined sentences correctly. <!-- src/components/sprint-board/StatusChangeLine.test.tsx -->
- [ ] Dismissing a combined line marks both ids seen. <!-- useStatusChanges test + seen route test -->

## Related

- [[BRDG-414]] — this story extends BRDG-414's status-change review-queue line, its table, seen-tracking, query, hook, and rendering. Read it first.
- Builds on `ticketScopeChange` (burnup scope line) and `extractLastStatusChangeAuthor` (the actor-extraction pattern this mirrors).
