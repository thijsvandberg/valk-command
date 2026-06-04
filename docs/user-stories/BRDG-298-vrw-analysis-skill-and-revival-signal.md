# BRDG-298 — VRW analyze-deprecation skill + revival signal

**Status:** Done
**Epic:** [Backlog Deprecation Review](../plans/2026-06-04-backlog-deprecation-review-epic.md)
**Type:** Story (two repos: VRW + Bridge)

## Problem

The epic's Tier-2 deep dive runs one workspace agent call per topic (replaced-area, superseded,
already-built, relevance-decay) using GENERIC skills (ask/investigate/find-related) with ad-hoc
prompts — up to four round-trips per ticket. Two gaps:

1. **No dedicated skill.** The deprecation analysis is spread across generic skills, so the prompts
   are duplicated and the gathering of signals (recent/active/planned sprints, codebase, product
   docs) is repeated per topic instead of done once.
2. **Only one direction.** The scan only ever concludes "this can probably go". It never spots the
   OPPOSITE: a ticket sitting low in the backlog that is still **high value** and a great fit for
   recent or planned/active sprint work — i.e. **worth pulling up** ("revival").

## Solution

### Part A — VRW skill (`analyze-deprecation`)

A new VRW skill, `.claude/skills/analyze-deprecation.md`, that takes a target ticket
(key + summary + description), gathers signals ONCE (Jira recent/open/future sprints, related
tickets, codebase, product docs), then scores every deprecation topic plus a revival assessment in a
single focused pass. It emits a parseable `<deprecation-analysis>` block (JSON body), mirroring
find-related's `<related-stories>` convention. Deprecated/Closed related tickets are capped like
find-related does.

### Part B — Bridge wiring + revival signal

- **Parser** (`src/lib/parse-deprecation-analysis.ts`): extracts the `<deprecation-analysis>` block,
  defaults missing fields, clamps scores to 0..1, never throws (null on absent/malformed block).
- **Consolidated analyzer** (`src/lib/deprecation-analyzer.ts`): submits the `analyze-deprecation`
  skill via `runAgentTaskToCompletion`, parses, and maps to the per-topic `scanScores` shape + a
  revival verdict. Skips fast when the agent is unconfigured.
- **runDeepScan** now PREFERS the consolidated analyzer (wired in `src/lib/topics/index.ts`). The
  existing per-topic scorers remain registered as the FALLBACK used when the analyzer is unavailable
  or returns nothing parseable. Nothing is deleted.
- **Revival data model**: `ticket_metadata.revival_score` (real, nullable) and
  `revival_rationale` (text, nullable); related keys stored in `scanScores.revival.evidence.relatedKeys`.
  Local-only, never synced to Jira. Migration `drizzle/0068_cheerful_mojo.sql`.
- **Revival notification**: when `revivalScore >= 0.6`, the deep-scan runner fires a distinct
  `revival-candidate` notification ("Backlog ticket worth pulling up: …"), separate from
  `deprecation-candidate`.
- **Direction reconciliation**: a winning revival (>= 0.6 and >= the deprecation score) suppresses
  the deprecation candidate promotion, so a ticket is a revival candidate INSTEAD OF a deprecation
  candidate (the two never double-fire). The skill is also instructed to keep the weaker direction's
  scores low, so this DB-side guard is a safety net.
- **/cleanup API**: each row now exposes `revivalScore` and `revivalRationale` (UI built separately).

## Implementation Plan

1. VRW: read find-related for conventions; write `analyze-deprecation.md`; commit in the VRW repo.
2. Bridge: add the parser + tests.
3. Bridge: add the consolidated analyzer + tests; wire it as primary in `topics/index.ts`.
4. Bridge: add `revival_score`/`revival_rationale` columns; generate migration.
5. Bridge: set revival fields in `runDeepScan`, reconcile direction, return new result fields.
6. Bridge: fire the `revival-candidate` notification in the deep-scan runner.
7. Bridge: extend `/cleanup` response + `cleanup-types.ts`.
8. Tests, lint, typecheck. Docs.

## Checklist

- [x] VRW `analyze-deprecation` skill with parseable `<deprecation-analysis>` block, committed in VRW
- [x] Parser `parse-deprecation-analysis.ts` (well-formed, missing fields, malformed -> safe)
- [x] Consolidated analyzer `deprecation-analyzer.ts` mapping incl. revival
- [x] `runDeepScan` prefers analyzer; per-topic scorers kept as fallback
- [x] `revival_score` + `revival_rationale` columns + migration `0068`
- [x] `runDeepScan` sets revival fields; reconciles deprecation-vs-revival direction
- [x] `revival-candidate` notification fires on threshold (0.6), distinct from deprecation
- [x] `/cleanup` exposes `revivalScore` + `revivalRationale`; `CleanupRow` extended
- [x] Tests: parser, analyzer mapping, runDeepScan revival + reconcile, runner notification, /cleanup
- [x] Existing topic tests stay green
- [x] `npm run lint` + `npm run typecheck` clean
- [x] Docs updated (workspace-integration, database-schema, this story, epic reference)

## Notes

- The consolidated analyzer is the primary path; per-topic scorers are intentionally kept as a
  graceful fallback (not removed) so the deep scan still works if the new skill is unavailable.
- Revival has no fallback path: it is an analyzer-only idea.

## Follow-up: `/cleanup` UI refresh (PO feedback)

Refactored the `/cleanup` view so the revival signal is visible and the surface matches the rest of
the app:

- The bespoke ~9-column wide table (which overflowed and forced horizontal scroll) was replaced with
  the app-standard `ChildIssueRow` + `TicketStatusPill` (same row/pill as the refinement select list
  and epic children). The list now fits the viewport — no horizontal scroll.
- The per-topic score columns collapsed into one compact **deprecation-score badge** on each row
  (overall score on the existing heat ramp). The full per-topic breakdown stays in the
  `DispositionPanel` drawer.
- Added a distinct **revival badge** (upward arrow, positive/green treatment) on rows where
  `revivalScore >= REVIVAL_CANDIDATE_THRESHOLD` (0.6), a **Revival candidates** filter, and a
  **Revival score** sort. The drawer now also shows the revival score + rationale.
- The `/api/cleanup/[key]/disposition` GET now returns `revivalScore` + `revivalRationale` so the
  drawer can explain why a ticket is worth pulling up.
- Selection, bulk confirm/dismiss, deep-scan selection, the Auto toggle, and the quick actions all
  continue to work unchanged.

### Second UI pass (PO feedback on screenshots)

Addressed the remaining direct PO feedback on the refreshed view:

- **Issue type on every row.** `GET /api/cleanup` + `CleanupRow` now carry the normalised issue `type`;
  the row passes it through and enables `showTypeIcon`, so the standard issue-type icon shows on each row.
- **Row badges.** `CleanupRow` now also carries `epic`/`epicKey`, `storyPoints`, open/total subtask counts,
  and `assignee`. The row renders the shared `EpicBadge` / `SubtaskCountBadge` / `MetricChip` (SP) from
  `IssueMetaBadges` plus the assignee `Avatar` — the same badges the rest of the app uses.
- **New filters.** Added issue-type, epic, assignee, reporter, and last-activity time-period filters
  (`< 1mo` / `1-3mo` / `3-6mo` / `6-12mo` / `> 1yr` / unknown). Option lists come from a server-computed
  `facets` object covering the whole eligible backlog; filtering itself is client-side over the loaded
  list (`cleanup-utils.ts`, pure + unit-tested). The last-activity buckets are derived from `jiraUpdatedAt`.
- **Standard controls + tooltips.** The controls bar was rebuilt on standard Bridge components — token-styled
  single-choice selects for sort/scanned/disposition/min-score, the app-standard `FilterDropdown` for the
  facet filters, `Button` quick-actions — and every control now has an explanatory `Tooltip` (quick actions,
  Auto toggle, score/disposition filters, the new facet filters).
- **Restyled selection bar.** The multi-select action bar now reuses the sprint board's `BarContainer`
  footer styling to match `BulkActionBar`: a brand select-all checkbox, an `N/total selected` counter,
  `BarDivider`s, and standard `Button`s for Deep-scan selected / Confirm / Dismiss / Clear.

### Third UI pass: scan governance, queue management, placement + epic badges (PO feedback)

Epic: Backlog Deprecation Review. Four PO-requested features on `/cleanup`:

- **Scan controls (`ScanControls.tsx`).** A "Scans" popover lists the three deprecation scheduler tasks
  (`deprecation-staleness-scan`, `deprecation-deep-scan`, `deprecation-auto-enqueue`), each with an on/off
  toggle reflecting the EFFECTIVE `enabled` state (all OFF by default) and a "Run now" button that triggers
  the task immediately even while off. Toggles call `POST /api/scheduler/tasks`; Run now calls
  `POST /api/scheduler/run/<name>`. After any action the queue + row list refresh. Tooltips explain each task.
- **Auto reconciliation (single source of truth).** The standalone "Auto: off" toggle (BRDG-290) was folded
  into the Scans popover as ONE auto on/off (plus the N/day count). Because auto-enqueue is gated by BOTH the
  scheduler task-enabled flag AND `deprecation-auto-scan:enabled`, the toggle writes both in lock-step
  (`scheduler.setTaskEnabled` + `autoScanSettings.update({ enabled })`). The scheduler task feed is the
  displayed source of truth; the daily-count input stays backed by `auto-scan-settings`.
- **Deep-scan queue list (`DeepScanQueuePanel.tsx`).** Replaced the "N queued M done" counter with a trigger
  pill (counts + running spinner) that opens a managed list: each item shows the ticket pill/key + title,
  a status treatment (pending / running spinner / done / error-with-message), source, and enqueued time.
  Pending items have a Remove (x) → `DELETE { key }`; running items are non-removable (no control). A
  "Clear pending" action → `DELETE { all: true }`. Reuses the page's existing 4s queue poll.
- **Sprint/backlog indicator + epic child-count badge.** `CleanupRow` + `GET /api/cleanup` now carry
  `sprintName` (null = backlog; backlog-only eligibility means this reads null today) and `epicChildCount`
  (grouped count of live tickets parented by `epicKey`; 0 for non-epics). New shared badges in
  `IssueMetaBadges`: `SprintOrBacklogBadge` (sprint name or a "Backlog" chip) and `EpicChildCountBadge`
  ("N stories"). Epic rows show the child-count badge; non-epics keep the subtask-count badge.
- Extracted the brand on/off switch into the shared `ToggleSwitch` component (reused by the auto control
  and the scan-control toggles). Tests cover the toggle/run wiring, queue list rendering + remove/clear,
  the placement indicator, the epic child-count badge, and the new API fields.
