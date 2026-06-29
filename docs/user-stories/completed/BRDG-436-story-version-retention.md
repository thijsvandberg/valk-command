# BRDG-436: Story version retention (collapse settled history)

**Status:** Done
**Priority:** Low
**Type:** Chore / Tech-debt

## Description
The `story_version` table stores a snapshot of a story's description + acceptance criteria every time the text actually changes in Jira (detected by content hash during sync, plus an optional manual changelog import). It had **no retention**: rows were only ever deleted when the whole ticket was removed from Jira and aged out (7 days). As a result the table grows unbounded; on production it had reached ~41k rows / ~16MB.

This story adds a retention policy that keeps full history while a story is actively being edited, then collapses a story's history down to just its latest snapshot once the story has been quiet for 6 weeks.

**Scope note (data reality).** Version capture only began ~2026-03-20 and is sync-driven (one snapshot when a story's text changes); the manual Jira-changelog import has been used on only 2 stories. As a result ~39.3k of ~39.9k stories with versions have just a **single** version (a snapshot, not a history). This retention policy therefore caps future *depth* growth on the ~600 multi-version stories; it does not (and is not meant to) reduce the dominant cost, which is *breadth* — one snapshot per backlog story. Breadth is bounded by ticket count, so it is not runaway growth. See [[BRDG-437-history-data-model-review]].

## Current Behaviour
- `story_version` (`src/db/schema.ts`) holds one row per detected content change, written by `upsertIssue` (`src/lib/upsert-issue.ts`) on sync and by the manual import route (`src/app/api/tickets/[key]/versions/import/route.ts`).
- Versions are read by the version-compare surfaces: the diff-preview page (`src/app/(app)/sprint-board/diff-preview/page.tsx`) and the Story Writer `DiffApp` (`src/components/story-writer/panes/apps/DiffApp.tsx`), plus a count badge on the ticket detail.
- The only deletion path is `cleanupRemovedTickets` (`src/lib/scheduled-tasks.ts`), which wipes all versions when a ticket is purged 7 days after removal from Jira. No per-story pruning existed.

## Proposed Approach
Add a daily scheduled task `prune-story-versions` (`src/lib/scheduled-tasks.ts`) that, per story:
- Considers a story **settled** when its newest version is older than `STORY_VERSION_RETENTION_MS` (42 days, 6 weeks).
- For settled stories, deletes every version except the latest; the latest snapshot is always kept so the current content stays available.
- Stories with a version newer than the cutoff keep their **full** history, because the diff/compare views need recent versions.

The prune is a single set-based SQL `DELETE` using a `ROW_NUMBER() OVER (PARTITION BY jira_key ORDER BY created_at DESC, id DESC)` window so exactly one row survives per settled story even when two versions share the same second-resolution `created_at`.

**Non-goals / out of scope**
- No change to when versions are *created* (sync hash detection + manual import are untouched).
- No retention on `ticket_scope_change` — deliberately deferred to [[BRDG-437-history-data-model-review]].
- No automatic `VACUUM`; freed pages are reclaimed on the next maintenance VACUUM. The DB-size warning threshold is unchanged.

## Implementation Plan
1. Add `STORY_VERSION_RETENTION_MS` (42 days, 6 weeks) and the `pruneStoryVersions` handler to `src/lib/scheduled-tasks.ts`.
2. Register it as a daily task (`prune-story-versions`, 24h) alongside the other cleanup tasks; it inherits the standard enable/disable toggle on the Jobs settings page.
3. Tests covering settled-collapse, active-keep, single-version no-op, timestamp tie, and mixed sets.

## Acceptance Criteria
- [x] A story whose newest version is older than 6 weeks keeps only its latest version; older versions are deleted. <!-- pruneStoryVersions settled collapse -->
- [x] A story edited within the last 6 weeks keeps its full version history. <!-- last_change >= cutoff => untouched -->
- [x] The latest version is always preserved, even for long-untouched stories. <!-- rn = 1 row never deleted -->
- [x] Exactly one version survives per settled story even when the two newest share an identical `created_at`. <!-- ROW_NUMBER id tiebreaker -->
- [x] The task returns the number of deleted rows and runs on a daily interval via the lazy-cron scheduler. <!-- defineTask prune-story-versions, { deleted } -->

## Tests
- [x] Collapses a settled story to only its latest version (deleted count = removed rows). <!-- src/lib/scheduled-tasks.test.ts -->
- [x] Keeps full history for a story changed within the retention window. <!-- src/lib/scheduled-tasks.test.ts -->
- [x] Leaves a settled story that already has a single version untouched (deleted = 0). <!-- src/lib/scheduled-tasks.test.ts -->
- [x] Keeps exactly one version when the newest timestamps tie. <!-- src/lib/scheduled-tasks.test.ts -->
- [x] Prunes only settled stories in a mixed set. <!-- src/lib/scheduled-tasks.test.ts -->

## Related
- [[BRDG-437-history-data-model-review]] — broader review of the unbounded history/audit tables (`ticket_scope_change`, burnup seeding); this story handles only `story_version`.
- `docs/architecture/scheduler.md` — the lazy-cron pattern this task plugs into.
- `docs/architecture/story-writer.md` — the version-compare surfaces that consume `story_version`.
