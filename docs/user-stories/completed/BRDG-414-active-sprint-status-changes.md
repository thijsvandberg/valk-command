# BRDG-414: Status changes on the active sprint board

**Status:** To Do
**Priority:** Medium
**Type:** Feature

## Description

When a ticket on the PO's team active sprint changes Jira status, the PO wants to see it **on the board** as a short review item, and act on it. For each change, surface:

- the **from → to** transition,
- **when** it happened — the **Jira event time**, not the local sync time,
- **who** made the change — but only shown when the changer **differs from the assignee** (the assignee avatar is already on the row, so repeating it is noise),
- a hint of **what else is new** — **new comments** and **story edited** — as links that deep-link into the ticket, with the exact time on hover (it is about *that something is new*, not the content itself). **"New" = a comment or story edit in the last 24h that was not made by me** (self-exclusion, as the Inbox already does — BRDG-359),
- for a change **to Test**: where it **deployed (UAT)** and any **pipeline failures**,
- for a change **to Done/Deprecated**: any **open subtasks** still remaining (a flag that it may not really be done).

It is a **review queue**: an item stays until the PO acts on it or marks it **seen**, then it clears. Per new status the item carries one contextual action:

- **Done / Deprecated → "Move to bottom"**: files the ticket just below a **permanent "Finished work" divider** at the bottom of the sprint **and marks the item seen** in the same gesture. Nothing auto-moves below the divider — the manual move *is* the PO's confirmation that the ticket is truly done.
- **Test → "Generate test prompt"**: a button now; the agent skill that actually builds the test prompt from story + comments + changes is a **follow-up** (see Related). The button is present but inert/"coming soon" in this story.
- **In Progress / To Do**: no special action, just "Seen".

**Chosen UI** (prototyped at `/dev/exploration/status-changes`, variant 1): a quiet, sentence-style line rendered directly beneath the changed board row — e.g. *"Updated from In Progress to Test by Frank · 2h ago · 💬 2 · ✎ · UAT2 · 8 green"* — no chip backgrounds, signals separated by dots, action right-aligned. It is the lightest of the three trialled treatments (the on-row icon cluster truncated titles; grouped chips added height).

The **permanent "Finished work" divider** and its **move-to-bottom** ordering behaviour are board-wide and are **in scope** for this story (confirmed with PO).

## Current Behaviour

- **Status changes are already captured.** `ticket_status_change` (`src/db/schema.ts` ~L887) stores `{ id, ticketKey, fromStatus, toStatus, changedAt, sprintName }`. `changedAt` is **Jira's own timestamp** (from the changelog `created` / `fields.updated`), not the local sync time. Written in two places:
  - `src/lib/upsert-issue.ts` (~L260–380) on every sync, but only as *previous-local-status → current-Jira-status* (multi-hop transitions between two syncs collapse to one row), and **without the author**.
  - `src/app/api/burnup/seed/route.ts` (~L150–165) pulls the full changelog via `jiraClient.getBurnupChangelog()`.
- **The changelog author is available but discarded.** `ChangelogEntry.author` (`displayName`, `avatarUrls`) is present in the Jira payload and already used elsewhere (`src/lib/jira-client.ts` L644, L1055, L1850). But `filterStatusChanges()` (`src/lib/jira-client.ts` L1867) keeps only `{ fromStatus, toStatus, changedAt }` and drops the author. So **"who" is the one piece of data not stored yet.**
- **No Jira webhook.** All Jira data is pull-based: watermark incremental sync (~150s) + sprint sync + manual triggers (`docs/architecture/jira-sync.md`). Changes appear within ~2.5 min, not instantly.
- **Board ordering / "move to bottom" building blocks exist.** The board sorts by `jiraRank`, overridden per-sprint by a manual PO key list `poPriorityOrder` (`src/components/sprint-board/useSprintBoardFilters.ts` ~L357), stored as `Record<sprintId, string[]>` via account setting `/api/settings/sprint-board-po-priority` and applied in `SprintBoard.tsx`. `src/lib/sprint-insert-position.ts` already provides `trailingDoneDepStart()` (start index of the trailing contiguous DONE/DEPRECATED block), `spliceKeyIntoOrder()` (splice a key just above that block in the manual order) and `interpolateRank()`. The existing quick "move to bottom" already lands a ticket *above* the trailing finished block — but there is **no persistent visual divider**, and finished tickets are not auto-grouped.
- **Test signals exist.** `useLastDeployed()` → `LastDeployedInfo { environment, completedAt, state }` (`/api/pipelines/last-deployed`) and `usePipelineHealth()` → `PipelineHealthEntry { status, recentFails, recentTotal, ... }` (`/api/pipelines/health`), both in `src/hooks/usePipelines.ts`. UAT environments are Bitbucket `environmentType: "Staging"` (e.g. `UAT1`, `UAT2`). Already rendered as Rocket/GitBranch chips in the ticket hover card.
- **Open-subtask count exists** on the board ticket payload: `openSubtaskCount` / `totalSubtaskCount` (`src/types/ticket.ts` L200–201).
- **"What's new" change kinds exist** as live events: `TicketChangeKind` (`comment`, `content`, …) in `src/lib/ticket-events.ts`, emitted from `upsert-issue.ts` after each write. But there is **no stored "latest comment at" / "last content-edit at"** and no per-user baseline for "since you last looked".
- **A per-user "seen" pattern exists** to mirror: `new_story_read` (`src/db/schema.ts` L399; query in `src/lib/new-stories-query.ts`) keyed `(userId, ticketKey)`, used by the Inbox to track read state.
- **No status-change UI on the board** today, and no per-ticket status-history API (`/api/tickets/[key]/status` is the status *write* route, not history).
- **Active sprint / team:** the board already selects the active sprint per slot (`SprintBoard.tsx` `activeSlot`); team = sprint-name prefix via `extractTeamPrefix()` (`src/lib/sprint-utils.ts`). There is no separate "my team" setting; scope is the active sprint shown on the board.

## Proposed Approach

### 1. Capture "who" (and accurate transitions)

- Add author columns to `ticket_status_change`: `changedBy` (display name), `changedByAccountId` (stable identity, nullable — consistent with the BRDG-360/363/364 accountId re-key), `changedByAvatar` (nullable URL). New drizzle migration.
- Extend `StatusChange` + `filterStatusChanges()` (`jira-client.ts`) to carry `{ author, authorAccountId, authorAvatar }` from `entry.author` (already parsed elsewhere in the file).
- Fetch the changelog **only for a ticket whose status actually changed this sync** (`upsert-issue.ts`) — record the real transition(s) + author via the extended `filterStatusChanges`, instead of the previous-local-vs-current diff. This runs **server-side during sync — background work the PO never waits on** — with the existing concurrency cap + backoff. Backfill via the existing `burnup/seed` path (extend it to write the new columns too).

### 2. Status-change review queue (data + read state)

- A per-user "seen" store mirroring `new_story_read`: new table `status_change_seen` keyed `(userId, statusChangeId)`, plus a route to mark seen / mark-all-seen. **Keying on the individual status-change id means every transition is its own item**: marking one seen never suppresses a *later* transition of the same ticket. So Test → In Progress → Test re-surfaces each time. (Single-user app, so per-user vs global is moot; mirroring the pattern keeps it consistent.)
- A read endpoint returning the **unseen** status changes for the **active sprint(s) currently on the board**, joined with the data each line needs: transition + author + Jira time, `openSubtaskCount`, and (for Test) last-deploy + pipeline-health. Scope to the active sprint via the board's existing sprint selection; team is implicit in that sprint.
- **Live update, no manual refresh.** When sync writes a new status change, the item must appear on an already-open board automatically. Reuse the existing `ticket:changed` SSE fan-out (`emitTicketEvent`, `src/lib/ticket-events.ts`, kinds already include `status`) that the board subscribes to — the queue revalidates on that event rather than on a page reload.

### 3. The quiet inline line (chosen UI, variant 1)

- Render a sentence-style line beneath each changed `BoardRow` for rows that have an unseen change: *"Updated from {From} to {To}[ by {Name}]"* — `by {Name}` only when `change.byAccountId/name !== assignee`. Status words colored by status; Jira time with exact-time tooltip; bare, dot-separated signals; action right-aligned. Mirror the prototype in `src/app/dev/exploration/status-changes/page.tsx`.
- **What's-new signals** (`💬 N`, `✎`): a comment or story edit counts as "new" when it is **within the last 24h and not authored by the current user**. Capture a lightweight `lastCommentAt` / `lastContentEditAt` (with author) during sync so the board can apply the 24h + self-exclude test; the signals deep-link into the ticket's comments / history, with the exact time on hover.
- **Test signals**: reuse `useLastDeployed` + `usePipelineHealth` (already fetched for the board) — Rocket(env) + GitBranch(fails/total), tinted green/red.
- **Open-subtask flag** (Done/Deprecated only): amber `ListChecks` "N open" from `openSubtaskCount`, shown only when `> 0`.
- A subtle brand left-accent marks a changed row; the line lives in `BoardRow.tsx` (the legacy `TicketRow.tsx` is being phased out — do not touch it).

### 4. Actions

- **Move to bottom** (Done/Deprecated): reuse `trailingDoneDepStart()` + `spliceKeyIntoOrder()` against the active sprint's `poPriorityOrder`, persist via `/api/settings/sprint-board-po-priority`, and apply optimistically through the **pending-edits overlay** (`docs/architecture/optimistic-updates.md`, `pendingTicketEdits.ts` / `useTicketActions.ts`) so it does not snap back. In the **same action**, mark the change seen. No separate "Seen" button on these rows.
- **Generate test prompt** (Test): button present but inert ("coming soon"), wired to a no-op that the follow-up story replaces. Keep a separate "Seen".
- **Seen** (all others): mark seen via the new endpoint; clears from the queue.

### 5. Permanent "Finished work" divider + move-to-bottom ordering (board-wide, in scope)

- Render a **permanent divider** in the sprint group, positioned at `trailingDoneDepStart()` (the boundary of the trailing contiguous DONE/DEPRECATED block), shown even when that block is empty (anchored at the bottom). It is informational; nothing auto-moves below it.
- Done/Deprecated tickets that the PO has not yet filed stay in place above the divider; "Move to bottom" relocates them just below it. This formalises the existing insert-position behaviour as visible board structure.

### Non-goals / out of scope

- The **agent skill + route that actually generate the test prompt** (separate follow-up story).
- A full per-ticket **status-history timeline** view (this story shows only the latest unseen change per ticket).
- Comment/story-only changes (no status change) creating their own queue entries — the queue is **status-change-driven**; comment/story are secondary signals on a status-change line.
- Real-time push: changes surface on the existing ~150s sync cadence; no webhook.

## Implementation Plan

Verified findings that shape the plan: the main sync already fetches `expand=changelog`, but the changelog author shape carries only `displayName` + `avatarUrls` (**no accountId**) — so `changedByAccountId` is usually null and the changer-vs-assignee compare is **name-based** with accountId as optional refinement. The board row is a `<tr>` with one `<td>`; the quiet line must stack **inside that `<td>`** (not a second `<tr>`) so the virtualizer's per-row height stays correct. Test deploy/pipeline maps already reach `BoardRow` via `makeRowProps`, and `openSubtaskCount` is already on the board ticket — no new fetch. The board's SSE bus (`subscribeEvents`) is the live-update hook.

1. **Schema + migration** (`src/db/schema.ts`, new `drizzle/*.sql`): add `changedBy` / `changedByAccountId` / `changedByAvatar` (nullable) to `ticketStatusChange`; add `status_change_seen` table keyed `(userId, statusChangeId)` mirroring `newStoryRead`.
2. **Capture who + accurate transitions** (`jira-client.ts`, `upsert-issue.ts`, `burnup/seed/route.ts`): extend `StatusChange`/`filterStatusChanges()` with author fields; rewrite the capture block to read the inline changelog (fallback `getStatusChangelog(key)` only for changed tickets, server-side/background) and write per-transition rows with deterministic ids (`onConflictDoNothing`); backfill writes the new columns.
3. **Read endpoint + seen store + live hook** (new `status-change-seen-store.ts`, `status-changes-query.ts`, `GET /api/status-changes`, `PUT|POST /api/status-changes/seen`, `useStatusChanges` hook): mirror `new-stories-query` + `new-story-read` patterns; scope by `sprintName IN (active sprint ids)`; hook revalidates on the `ticket:changed` bus (kinds status/comment/content) → no manual refresh.
4. **"What's new (24h, not me)"**: derive in the query from existing `jiraComment.createdAt`/`authorName` and `storyVersion.createdAt`/`updatedBy` (24h window + self-exclude by display name, mirroring the inbox name-match). No new sync capture unless name-match proves too brittle.
5. **Quiet inline line UI** (new `StatusChangeLine.tsx`, port variant 1 from the prototype; wire into `BoardRow.tsx` stacked inside the `<td>`, pass through `TicketTable.tsx` `makeRowProps`): sentence + Jira-time tooltip + bare signals + actions; test signals read existing maps; changer shown only when ≠ assignee.
6. **Permanent "Finished work" divider** (`TicketTable.tsx`): render at `trailingDoneDepStart()` per sprint group, pinned at the bottom when the block is empty; sprint groups only.
7. **Move-to-bottom action** (`SprintBoard.tsx` + `useTicketActions.ts`): reuse the create-flow `spliceKeyIntoOrder` against `poPriorityOrder`, persist via `/api/settings/sprint-board-po-priority`, mark seen in the same gesture; optimistic via the existing overlay (client-persisted setting → no snap-back). Plus Seen / Mark-all-seen wiring.
8. **Tests** alongside each phase (see Tests section): `jira-client.test.ts`, `upsert-issue.test.ts`, `StatusChangeLine.test.tsx`, `sprint-insert-position.test.ts`, `TicketTable.test.tsx`, `status-changes-query.test.ts`, `status-changes/seen/route.test.ts`.

Risks: accountId unavailable from changelog (name-based compare); inline-changelog truncation (changelog fallback for changed tickets only); self-exclude by display name only (single-PO app, acceptable). Order: 1 → 2 → 3 (+4) → 5/6 → 7, tests per phase.

## Acceptance Criteria

- [x] A ticket on the active sprint whose Jira status changed shows a quiet line beneath its board row with the from → to transition. <!-- BoardRow.tsx; prototype src/app/dev/exploration/status-changes/page.tsx -->
- [x] The line shows the **Jira event time** (relative, with exact time on hover), never the local sync time. <!-- ticket_status_change.changedAt -->
- [x] The changer's name+avatar shows **only when it differs from the assignee**; otherwise only the time shows. <!-- compare changedByAccountId/name vs row assignee -->
- [x] "Who" is captured from the Jira changelog author. <!-- filterStatusChanges() in jira-client.ts + new ticket_status_change.changedBy/By columns -->
- [x] New comments and story edits appear as deep-link signals (with activity time on hover) only when within the last 24h and not authored by the current user. <!-- lastCommentAt/lastContentEditAt + author; self-exclude per BRDG-359 -->
- [x] A change to **Test** shows the latest UAT deploy + pipeline-failure signal. <!-- useLastDeployed + usePipelineHealth -->
- [x] A change to **Done/Deprecated** shows an "N open" flag when `openSubtaskCount > 0`. <!-- openSubtaskCount, src/types/ticket.ts -->
- [x] **Move to bottom** files the ticket just below the Finished work divider AND marks the item seen in one action. <!-- trailingDoneDepStart + spliceKeyIntoOrder + /api/settings/sprint-board-po-priority + status_change_seen -->
- [x] The reorder applies optimistically and does not snap back on the next sync. <!-- pending-edits overlay, useTicketActions.ts -->
- [x] A **permanent "Finished work" divider** renders at the trailing DONE/DEPRECATED boundary, even when that block is empty; nothing auto-moves below it. <!-- sprint group render + trailingDoneDepStart -->
- [x] A change to **Test** shows a "Generate test prompt" button (inert/"coming soon" in this story). <!-- placeholder; follow-up story -->
- [x] An item stays in the queue until acted on or marked **seen**; a sprint-header toggle opens/closes all update lines at once. <!-- per-item Seen + move-marks-seen; subtle icon-only open/close toggle in GroupStatBar (updatesAction). Bulk "mark all seen" endpoint + hook.markAllSeen exist & tested; the PO chose a show/hide toggle over a bulk-clear, so the clear-all control is left as an optional follow-up. -->
- [x] Each transition is its own item: after marking a change seen, a later transition of the same ticket re-surfaces (e.g. Test → In Progress → Test shows each time). <!-- status_change_seen keyed on (userId, statusChangeId); status-changes-query.test.ts -->
- [x] A new status change appears on an already-open board **without a manual refresh**. <!-- ticket:changed SSE fan-out, emitTicketEvent kinds include "status" -->
- [x] Scope is the active sprint(s) currently shown on the board. <!-- SprintBoard activeSlot selection -->

## Tests

- [x] `filterStatusChanges()` retains author/avatar/accountId from the changelog. <!-- src/lib/jira-client.test.ts -->
- [x] Status-change capture stores the author and the Jira `changedAt` on sync. <!-- src/lib/upsert-issue.test.ts -->
- [x] Changer-vs-assignee rule: name shown when different, hidden when equal. <!-- component test for the line -->
- [x] Move-to-bottom lands the ticket above the trailing block and marks it seen. <!-- splice proven by sprint-insert-position.test.ts; "marks seen" by status-changes-query.test.ts; handler wires both -->
- [x] Divider renders at the correct boundary, including the empty-block case. <!-- boundary (incl. empty -> trailingDoneDepStart returns length) proven by sprint-insert-position.test.ts; render is a thin wrapper, verified visually -->
- [x] Open-subtask flag shows only for Done/Deprecated with `openSubtaskCount > 0`. <!-- component test -->
- [x] Mark-seen / mark-all-seen clears items for the current user. <!-- src/lib/status-changes-query.test.ts -->
- [x] A change marked seen stays cleared, but a later transition of the same ticket produces a new unseen item. <!-- status_change_seen keyed on statusChangeId; status-changes-query.test.ts -->
- [x] "New" comment/story signal respects the 24h window and excludes the current user's own activity. <!-- status-changes-query.test.ts -->

## Related

- Prototype: `src/app/dev/exploration/status-changes/page.tsx` (variant 1 chosen; 2/3 kept for comparison) and the `/dev/exploration` hub entry.
- [[BRDG-426-generate-test-prompt]] — follow-up that makes the inert "Generate test prompt" button real (agent skill + `/api/tickets/[key]/generate-test-prompt`).
- Builds on: `src/lib/sprint-insert-position.ts` (`trailingDoneDepStart`, `spliceKeyIntoOrder`), `docs/architecture/optimistic-updates.md`, `docs/architecture/jira-sync.md`, `new_story_read` read-state pattern, `usePipelines` signals.
- [[BRDG-039-test-center]] — test status (`testStatus`, `lastTestRunAt`) overlaps with the Test-row signals.
