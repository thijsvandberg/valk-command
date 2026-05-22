# BRDG-158: Automatic Sprint Metadata Sync

**Status:** Done
**Priority:** High

## Description

As the PO, I want sprint metadata (state, goal, dates) to sync automatically from Jira so that when I activate a sprint in Jira, Bridge reflects the change within minutes without manual intervention.

## Current Behavior

- Sprint metadata (state, goal, startDate, endDate) is only synced when the user manually clicks "Sync sprints" in the Sprint List Modal.
- The incremental sync (every 150s) only syncs **tickets**, not sprint metadata.
- If a sprint is activated in Jira, Bridge continues to show it as "future" until a manual sync is performed.
- The sprint goal is fetched during manual sync via the Agile API enrichment step, but never refreshed automatically.

## Implementation Plan

1. **Add `getSprintsLightweight()` to `JiraClient`** (`src/lib/jira-client.ts`)
   - Uses Agile board endpoint (`GET /rest/agile/1.0/board/{boardId}/sprint?state=active,future`) for a single API call
   - Falls back to existing `getSprints()` when no boardId configured
   - Reuses existing `JiraSprintListResponse` interface which matches the endpoint shape

2. **Add `completeDate` to `StoredSprint`** (4 files: `sync-sprints/route.ts`, `sprints/[id]/route.ts`, `velocity/route.ts`, `sprints/route.ts`)
   - Add `completeDate: string | null` to each StoredSprint definition
   - Update `sprintToStored()` to map `completeDate`

3. **Add sprint refresh step to incremental sync** (`src/app/api/jira/sync-incremental/route.ts`)
   - Separate 5-minute cooldown tracked via `jira_sprint_sync_watermark` app_setting
   - `refreshSprintMetadata()` helper: check cooldown, fetch, detect state transitions, merge, log
   - Runs on all code paths (ticket changes, no changes, cooldown-skipped) since sprint cooldown is independent
   - Wrapped in try/catch so failures never block ticket sync

4. **Update client hook** (`src/hooks/useIncrementalSync.ts`)
   - Add `sprintMetaRefreshed` to response interface
   - Trigger SWR revalidation on `/api/jira/sprints` when flag is set

5. **Tests** for the new `refreshSprintMetadata` logic and client hook changes

## Desired Behavior

### 1. Add automatic sprint metadata refresh to incremental sync cycle

- [x] Add a sprint metadata refresh step to the incremental sync flow
- [x] Use a separate, longer interval for sprint metadata (every 5 minutes) independent of the ticket sync cooldown (120s)
- [x] Track last sprint sync timestamp via a dedicated `app_setting` key (`jira_sprint_sync_watermark`)
- [x] On each incremental sync run, check if 5 minutes have elapsed since last sprint metadata sync; if so, refresh

### 2. Lightweight sprint state check

- [x] When `JIRA_BOARD_ID` is configured, use the Agile board sprint endpoint (`GET /rest/agile/1.0/board/{boardId}/sprint?state=active,future`) to fetch sprint metadata in a single API call
- [x] This endpoint returns id, name, state, startDate, endDate, completeDate, and goal in one response (no enrichment step needed)
- [x] Fall back to the existing JQL-based `getSprints()` approach when no boardId is configured
- [x] Add a new method `getSprintsLightweight()` (or similar) to `JiraClient` for the board-based approach

### 3. Merge and update cached sprint data

- [x] Use the same merge strategy as `sync-sprints`: remove cached entries matching synced states, merge fresh data
- [x] Detect state transitions (future -> active, active -> closed) and log them to `activity_log`
- [x] Invalidate the `/api/jira/sprints` cache after updating so the UI picks up changes on next render

### 4. Include full sprint metadata in sync

- [x] Ensure goal is always synced (already available from the Agile board endpoint)
- [x] Ensure startDate, endDate, and completeDate are synced
- [x] If a sprint goal is updated in Jira, the change is picked up within 5 minutes

### 5. Client-side cache refresh

- [x] After incremental sync returns, if sprint metadata was refreshed, trigger SWR revalidation on the sprint list
- [x] The incremental sync response should include a `sprintMetaRefreshed: boolean` flag so the client knows to revalidate

## Technical Notes

### API call cost

**With boardId (preferred):**
- 1 API call: `GET /rest/agile/1.0/board/{boardId}/sprint?state=active,future`
- Returns all fields including goal, no enrichment needed
- Cost: **1 call per 5 minutes = ~288 calls/day**

**Without boardId (fallback):**
- 1-3 JQL search calls + N enrichment calls (one per sprint for goal)
- Typical cost: ~4-7 calls per sync
- Cost: **~4-7 calls per 5 minutes = ~1,150-2,000 calls/day**

Both are well within Jira Cloud rate limits.

### Implementation approach

The simplest approach is to add the sprint refresh check inside the `POST /api/jira/sync-incremental` handler, after the ticket sync logic. This keeps it as a single polling loop on the client side rather than introducing a second timer.

```
// Pseudocode for the sprint refresh step:
const sprintCooldown = 5 * 60 * 1000; // 5 minutes
const lastSprintSync = await getSetting("jira_sprint_sync_watermark");
if (elapsed > sprintCooldown) {
  const sprints = await jiraClient.getSprintsLightweight(signal);
  mergeCachedSprints(sprints, ["active", "future"]);
  cache.invalidate("/api/jira/sprints");
}
```

### StoredSprint fields

Currently stored: `id, name, state, startDate, endDate, goal`. No schema change needed since the Agile board endpoint returns all these fields. Consider also storing `completeDate` for closed sprints.

## Out of Scope

- Automatic sync of closed/historical sprints (remains manual via "Sync history")
- Jira webhook-based push sync (BRDG-016)
- Changes to the manual sync button behavior (keep as-is for force-refresh)
