# BRDG-371: New stories land bottom in a sprint, top in a backlog

**Status:** Completed
**Priority:** Medium
**Type:** UX / Sprint board
**Related:** Reverses/supersedes [BRDG-354](completed/BRDG-354-new-story-rank-to-top-of-sprint.md). Shares the placement rule with [BRDG-370](BRDG-370-unified-sprint-placement-policy.md).

## Description

A newly created story should land in the same place a moved ticket would (BRDG-370),
minus the status exception (new stories are always `TO DO`):

- **Regular numbered sprint** → **bottom** (above the trailing done/deprecated block).
- **Backlog** (named backlog or generic) → **top**.

This **reverses [BRDG-354](completed/BRDG-354-new-story-rank-to-top-of-sprint.md)**, which
currently ranks new stories to the **top** of a regular sprint and leaves backlog creates
at the bottom. The PO now wants the opposite, matching the unified move rule.

## Affected create flows

1. **Inline "+" create-story card** on a sprint — the `Create story in this sprint...` /
   `Create story in the backlog...` composer (`ChildIssueComposer`) rendered per group in
   [TicketTable.tsx:882](../../src/components/sprint-board/TicketTable.tsx#L882) /
   [TicketTable.tsx:933](../../src/components/sprint-board/TicketTable.tsx#L933), created via
   `handleCreateTicket` in [SprintBoard.tsx:463](../../src/components/sprint-board/SprintBoard.tsx#L463).
   - For a **regular sprint** the composer and the created row stay at the **bottom**
     (above the trailing done/deprecated block — current behaviour, keep).
   - For a **backlog** the composer card and the created row appear at the **top** of the
     group.
2. **Story Writer "create new"** with a target sprint — `POST /api/story-writer/create`
   ([route.ts](../../src/app/api/story-writer/create/route.ts)).
3. **Shared board / epic-children create** — `createTicketWithJira()`
   ([create-ticket.ts](../../src/lib/create-ticket.ts)), also used by placeholder promotion.

## Approach

- **Server side:** in the create paths that currently call `rankToTopOfSprint` after the
  sprint move (added by BRDG-354), switch to the placement rule: rank to **bottom** for a
  regular sprint, **top** for a backlog (`rankToTopOfBacklog` already exists). Reuse the
  same `isBacklogSprintName` / `isRegularSprint` decision as [BRDG-370](BRDG-370-unified-sprint-placement-policy.md).
  Keep the rank call best-effort / non-fatal.
- **Inline composer placement (client):** `handleCreateTicket` already interpolates a
  `jiraRank` at the bottom (above the done/dep block). For a backlog target, interpolate a
  rank at the **top** instead, and render the composer card at the top of the backlog group
  rather than the bottom. Regular sprints keep today's bottom placement.
- **Optimistic insert** continues to follow the existing pattern so the row does not snap
  back (see [optimistic-updates.md](../architecture/optimistic-updates.md)).

## Implementation Plan

### Single server seam: `landNewTicket`

Generalize `landTicketAtTopOfSprint(key, sprintId)` in [sprint-rank.ts](../../src/lib/sprint-rank.ts)
into one dispatcher `landNewTicket(key, assignedSprintId: string | null)` that all four
server create paths share (`create-ticket.ts`, `story-writer/create`, `tickets/[key]/children`,
`draft-sync.ts`). New stories are always `TO DO`, so there is no in-flight exception.

- `assignedSprintId === null` (generic backlog) → Jira `rankToTopOfBacklog([key])`; local
  `jiraRank` = (min rank among backlog peers `sprintName IS NULL OR ''`) − 1, else 0.
- else resolve the display name (`sprintDisplayName(id)`: `sprint_name_cache` first, then the
  `jira_sprints` appSetting JSON, else null):
  - backlog name (`isBacklogSprintName`) → top of that sprint (`rankToTopOfSprint` + local min−1).
  - `isRegularSprint` → **bottom** (`rankToBottomOfSprint` + local **max+1**).
  - unresolved / other → top (safe default, matches `placementForMove`).
- All steps best-effort / never throw, as today.

### Server callers

- `createTicketWithJira()` and `story-writer/create`: replace the
  `if (assignedSprintId) landTicketAtTopOfSprint(...)` with an **unconditional**
  `await landNewTicket(key, assignedSprintId ?? null)` so generic-backlog creates rank to top.
- `tickets/[key]/children` and `draft-sync.ts`: swap to `landNewTicket` for a single seam
  (keeps the renamed export consistent; epic-child/draft backlog creates also get top).

### Client optimistic placement (`handleCreateTicket`, SprintBoard)

Detect backlog target: `sprintId == null || isBacklogSprintName(sprintNameMap[sprintId])`.
- backlog → `interpolateRank(undefined, sprintTickets[0]?.jiraRank)` (top; null if empty).
- regular → today's `insertIdx = trailingDoneDepStart(...)` + `interpolateRank(prev, next)` (bottom).

### Inline composer card position (`TicketTable`)

- Grouped: broaden `isBacklogGroup` to `group.key === "__backlog__" || isBacklogSprintName(group.label)`;
  render `ChildIssueComposer` **above** the table for a backlog group, below for regular sprints.
  Keep `createTargetSprintId = group.key === "__backlog__" ? null : group.key` (named backlog posts its real id).
- Flat: `flatInsertIdx = flatIsBacklog ? 0 : trailingDoneDepStart(tickets)`, where `flatIsBacklog`
  = `flatCreateTarget.sprintId === null || isBacklogSprintName(sprintNameMap[flatCreateTarget.sprintId])`.

### Tests

- `sprint-rank.test.ts` (rewrite for `landNewTicket`): regular → `rankToBottomOfSprint` + local max+1;
  named backlog → `rankToTopOfSprint` + min−1; generic backlog → `rankToTopOfBacklog` + min−1;
  unresolved name → top; best-effort on Jira failure.
- `create-ticket.test.ts` + `story-writer/create/route.test.ts`: regular → bottom; generic backlog →
  `rankToTopOfBacklog`; named backlog → top; keep move-fail / rank-fail best-effort.
- `TicketTable` test: backlog group composer renders above rows; regular below; flat backlog → row 0.

### Risks

- Sprint name may not be cached at create time; the `jira_sprints` fallback usually covers it,
  else it defaults to top and self-corrects on next sync (never buries a ticket).
- Server bottom local-rank is coarse (last, not "above done/dep"); the client optimistic row is
  what the PO sees, and Jira's `rankToBottomOfSprint` is canonical. Cosmetic/transient.

## Checklist

- [x] Replace the BRDG-354 rank-to-top in `createTicketWithJira()` with the placement rule (regular → bottom, backlog → top)
- [x] Apply the same rule in `POST /api/story-writer/create`
- [x] Inline composer: render the create-story card at the top for a backlog group; bottom for regular sprints
- [x] `handleCreateTicket` interpolates a top rank for backlog targets, bottom for regular sprints
- [x] Update [BRDG-354](completed/BRDG-354-new-story-rank-to-top-of-sprint.md) status to "Superseded by BRDG-371"
- [x] Tests: create-ticket placement (sprint vs backlog), story-writer create placement, inline composer position
- [x] `lint`, `typecheck`, `test`, `build` pass

**Implementation notes:**
- The single seam is `landNewTicket(key, assignedSprintId | null)` in `sprint-rank.ts`
  (replaces `landTicketAtTopOfSprint`); all four create callers adopt it
  (`createTicketWithJira`, `story-writer/create`, `tickets/[key]/children`, `draft-sync`).
- `createTicketWithJira` + `story-writer/create` call it unconditionally, so generic-backlog
  creates now rank to top of backlog. `children`/`draft-sync` keep their `if (assignedSprintId)`
  guard (out-of-scope backlog behaviour unchanged); their regular-sprint creates follow the rule.
- Grouped composer-position is verified via the flat-composer tests + the shared
  `isBacklogGroup` predicate; the grouped open-flow is not unit-tested because
  `TicketTable.test.tsx` stubs `GroupStatBar` (the "+" trigger) to null.
