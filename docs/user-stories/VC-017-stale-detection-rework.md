# VC-017: Stale Detection Rework

**Status:** In Progress
**Priority:** High
**Depends on:** VC-011 (Real Jira Integration)

## Description

The current staleness system is broken. `qualityStale` is never cleared once set, causing "Story changed" to appear on every ticket over time. The `freshness` timer (5 min since last sync) shows orange dots on all tickets without conveying meaningful information.

Replace both mechanisms with a data-comparison model based on two data layers:

1. **Local edits** (`ticketLocalEdit`): PO changes made in valk-command, not yet pushed to Jira.
2. **Jira mirror** (`ticket` + `storyVersion`): fetched from Jira on sync, with timestamps. Read-only locally.

## Data Model

### Existing tables (no schema changes needed)

- `ticket.jiraUpdatedAt`: remote last-changed timestamp from Jira
- `storyVersion`: content snapshots with `contentHash` and `createdAt`
- `ticketLocalEdit`: local edits with `field`, `localValue`, `baseJiraVersion`, `modifiedAt`

### Fields to remove

- `ticketMetadata.qualityStale` (boolean): replace with computed state
- `Ticket.freshness` (API response field): remove entirely

### Computed state

Staleness is no longer stored. It is derived at query time:

```
hasLocalEdits = ticketLocalEdit exists for this ticket
latestMirror  = most recent storyVersion.createdAt
baseVersion   = ticketLocalEdit.baseJiraVersion (content hash the edit was based on)
currentHash   = latest storyVersion.contentHash

if (!hasLocalEdits):
  state = "clean"                        // nothing to show
elif (baseVersion === currentHash):
  state = "local_edits"                  // safe to push
else:
  state = "conflict"                     // mirror updated after edit started
```

## UI States

| State | Side panel | Ticket table | Single view | Action |
|-------|-----------|-------------|-------------|--------|
| Clean | No indicator | No indicator | No indicator | None |
| Local edits | Blue "Local changes" badge | Blue dot | "Push to Jira" button | Push to Jira |
| Conflict | Orange "Conflict" warning | Orange dot | Warning + diff viewer | Review diff, choose version |

## Acceptance Criteria

### Remove old system
- [x] Remove `qualityStale` column from `ticketMetadata` (migration)
- [x] Remove `freshness` computation from `/api/tickets` route
- [x] Remove `freshness` and `qualityStale` from `Ticket` type
- [x] Remove all UI code that reads `qualityStale` or `freshness`

### Implement computed staleness
- [x] Add utility function `computeTicketState(ticket, localEdits, latestVersion)` that returns `"clean" | "local_edits" | "conflict"`
- [x] Expose state in ticket API responses (computed, not stored)
- [x] On ticket detail open (side panel or single view): auto-check Jira for latest version and update mirror silently

### UI: Clean state
- [x] No dots, badges, or warnings shown
- [x] This should be the default for 90%+ of tickets

### UI: Local edits state
- [x] Side panel: blue "Local changes" badge
- [x] Ticket table: blue dot next to key
- [x] Single view: "Push to Jira" button in edit section
- [x] Push flow: send local edits to Jira, wait for confirmation, then refresh mirror and delete local edits if versions match

### UI: Conflict state
- [x] Side panel: orange "Conflict" warning with "View diff" link
- [x] Ticket table: orange dot next to key
- [x] Single view: warning banner with diff viewer
- Moved to VC-018: Diff viewer shows local edits vs latest Jira version
- Moved to VC-018: User can choose "Keep local" / "Discard local"

### Push to Jira flow
- [x] Pre-push check: verify mirror is up-to-date with remote (compare `jiraUpdatedAt` with Jira API). If not, update mirror first and re-evaluate state (may become conflict)
- [x] On successful push: refresh mirror from Jira, verify versions match, then delete local edits
- [x] On conflict detected during push: switch to conflict state, show diff

## Technical Design

### State computation

`src/lib/ticket-state.ts`:

```typescript
type TicketEditState = "clean" | "local_edits" | "conflict";

function computeTicketEditState(
  localEdits: TicketLocalEdit[],
  latestVersionHash: string | null
): TicketEditState {
  if (localEdits.length === 0) return "clean";

  // All local edits should reference the same base version
  const baseHash = localEdits[0].baseJiraVersion;
  if (baseHash === latestVersionHash) return "local_edits";

  return "conflict";
}
```

### Auto-sync on open

When a ticket is opened in the side panel or single view, silently fetch the latest version from Jira and update the local mirror. This ensures the state computation uses fresh data without requiring manual refresh.

### Push endpoint

`PUT /api/tickets/[key]/push-to-jira`:

1. Fetch latest remote version from Jira
2. If remote hash !== local mirror hash: return `{ conflict: true }`, update mirror
3. If match: push local edits to Jira via existing write API
4. On success: refresh mirror, delete local edits, return `{ success: true }`

### Migration

Remove `qualityStale` from `ticketMetadata`. Since it is a boolean column with a default, this is safe to drop. The `qualityScore` field stays as-is (it is still useful independently).

## Notes

- The `storyVersion` table continues to track content history for auditing and diff display. No changes needed there.
- Sprint insights that currently count `qualityStale` tickets should count `conflict` tickets instead.
- The "quality score" feature is unrelated and stays. The score just won't have a "stale" flag anymore. If the user wants to know whether a score is still relevant, they can compare `storyVersion.createdAt` with when the score was last set (future enhancement, not in scope).
