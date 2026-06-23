# BRDG-380: Robustness fixes and dead-code cleanup

**Status:** Not Started
**Priority:** Medium
**Type:** Best-practice / Stability — small fixes grab-bag

## Description

The codebase audit ([2026-06-22-codebase-audit.md](../investigations/2026-06-22-codebase-audit.md))
turned up a set of small, independent robustness fixes and dead-code removals that don't belong to
the larger themed stories. Each is low-risk and mechanical. They're grouped here so they can be done
in one focused pass rather than scattered. The two genuine bug fixes (`draft-sync` `.run()`, the
unguarded `JSON.parse` that can break the Scheduled Jobs view) lead.

## Current Behaviour / Findings

- **`draft-sync` no-op write (High).** [draft-sync.ts:139-143](../../src/lib/draft-sync.ts): in the
  `finalizeDraft` catch block, `db.update(ticket).set({ status: "DRAFT_FAILED", ... }).where(...)`
  is constructed but `.run()` is never called (Drizzle better-sqlite3 statements are lazy). A failed
  finalize silently leaves the draft in its prior state — invisible and unrecoverable. **Fix:** add `.run()`.
- **Unguarded `JSON.parse` in scheduler (Medium).** [scheduler.ts:245](../../src/lib/scheduler.ts):
  `lastResult: lastResultRow ? JSON.parse(...) : null` has no try/catch; one corrupt/legacy row
  throws and breaks the entire `getTaskStatuses()` call (the Scheduled Jobs view).
  **Fix:** use the existing `safeJsonParse` (`api-validation.ts:35`).
- **Unguarded `JSON.parse` in task-registry (Low).** [task-registry.ts:79](../../src/lib/task-registry.ts):
  same pattern in the hot System Tasks status path. **Fix:** try/catch → `null`.
- **`formatTimestamp` shows "Invalid Date" (Medium).** [format-timestamp.ts:1-16](../../src/lib/format-timestamp.ts):
  `new Date(iso)` on bad input yields literal "Invalid Date" text (the try/catch never fires).
  **Fix:** `if (Number.isNaN(d.getTime())) return "";` (matches `date-utils.ts`).
- **Dead `hasHeader` branch (Medium).** [adf-to-markdown.ts:309-319](../../src/lib/adf-to-markdown.ts):
  the `if (hasHeader)`/`else` blocks are byte-identical, so the flag has no effect and headerless
  tables are rendered as if row 0 were a header. **Fix:** collapse to one path, or implement the
  genuinely-different headerless rendering.
- **`extractTeamPrefix` vs `sprintTeamToken` divergence (Medium).**
  [sprint-utils.ts:4-7](../../src/lib/sprint-utils.ts) (`/^([A-Z]+)[: ]/`) vs
  [epic-children-grouping.ts:216-219](../../src/lib/epic-children-grouping.ts) (everything before
  first `:`, mixed case). For `Design: Backlog` they disagree. **Fix:** consolidate to one helper
  in `sprint-utils.ts`.
- **`isEpicChild` triplicated (Medium).** [EpicChildrenSection.tsx:83](../../src/components/ticket-detail/EpicChildrenSection.tsx),
  [EpicChildrenBySprint.tsx:102](../../src/components/ticket-detail/EpicChildrenBySprint.tsx),
  [EpicProgressToolbar.tsx:29](../../src/components/ticket-detail/EpicProgressToolbar.tsx): identical
  `"storyPoints" in child` guard in three files. **Fix:** move to a shared module and import.
- **Dead `useActivityStatus` export (Medium).** [useSprintBoard.ts:173-179](../../src/hooks/useSprintBoard.ts):
  unused, and collides by name with the real `useActivityStatus` from `ActivityContext`. **Fix:**
  remove (move to `deleted/` per project rule).
- **`STATE_ORDER` NaN comparator (Low).** [epic-children-grouping.ts:64](../../src/lib/epic-children-grouping.ts):
  `STATE_ORDER[a.state] - STATE_ORDER[b.state]` is `NaN` on dirty `state`. **Fix:** `?? 9` fallback
  (matches `sprint-utils.ts:136`).
- **SWR default fetcher swallows errors (Low).** [SWRProvider.tsx:6](../../src/components/SWRProvider.tsx):
  returns `null` on non-ok instead of throwing, so SWR `error`/retry is bypassed for keys using the
  default fetcher. **Fix:** make the default throw on non-ok (align with `swrFetcher`); the few
  intentional "soft" consumers opt into `.catch()` locally.
- **`scanScores` parse duplicated x3 (Low).** [cleanup-types.ts:163](../../src/lib/cleanup-types.ts)
  (`parseScanScores`) reimplemented inline in `deprecation-staleness-runner.ts:143-148`,
  `deprecation-topics.ts:263-268`, `topics/already-built-topic.ts:165-170`. **Fix:** extract a
  shared raw parser.
- **Uncleaned timers / SSE reconnect (Low).** [useBulkSuggest.ts:47](../../src/hooks/useBulkSuggest.ts)
  toast `setTimeout` with no cleanup; [event-bus.ts:56-65](../../src/lib/event-bus.ts) SSE reconnect
  at fixed 3s with no backoff/cap. **Fix:** track the timer in a ref / add capped exponential backoff.
- **Dead `backlog` state key (Low).** [sprint-utils.ts:135](../../src/lib/sprint-utils.ts):
  `slugToSprintId` order record includes a `backlog` state that Jira never emits. **Fix:** remove.

## Proposed Approach

Work top-to-bottom (bugs first). Each item is independent; group the lib-helper consolidations
(`extractTeamPrefix`, `isEpicChild`, `scanScores`) so the shared modules land cleanly. The SWR
fetcher change is the only one that touches error semantics app-wide — verify the soft consumers
(`useSidebarData` count, `ActivityContext`) still behave.

## Implementation Plan

(Generated by Opus Plan agent. Verified against current source; line numbers drifted slightly.)

**Commit 1 — Critical bug.** `draft-sync.ts` finalizeDraft catch block: append `.run()` to the `DRAFT_FAILED` update. Test: force inner tx to throw, assert row persists `DRAFT_FAILED`.

**Commit 2 — Unguarded JSON.parse hardening.**
- `scheduler.ts:245` → `safeJsonParse(lastResultRow?.value, null)`. Test: corrupt row → `null`, no throw.
- `task-registry.ts:79` → `safeJsonParse(...)`. Test: corrupt row → `null`.
- `format-timestamp.ts`: after `new Date(iso)` add `if (Number.isNaN(d.getTime())) return "";`. Test: bad input → `""`.

**Commit 3 — Lib dead-code / divergence.**
- adf-to-markdown `if(hasHeader)`/`else` are byte-identical → collapse to single always-header path; drop now-unused `hasHeader`. Test: headerless table still renders with `---` separator.
- Consolidate team-token: export `sprintTeamToken` (case-preserving, before-first-colon) from `sprint-utils.ts`; epic-children-grouping imports it. Do NOT merge into `extractTeamPrefix` (different contracts: uppercase-anchored vs case-preserving). Test: `sprintTeamToken` cases in sprint-utils.test.ts.
- `STATE_ORDER` comparator: `(STATE_ORDER[a] ?? 9) - (STATE_ORDER[b] ?? 9)`.
- Remove dead `backlog` key from `slugToSprintId` order record.

**Commit 4 — scanScores parser.** `parseScanScores` narrows, so it can't be reused directly. Add `parseScanScoresRaw(raw): Record<string, unknown>` (try/catch → `{}`) in cleanup-types.ts; `parseScanScores` calls it; replace inline blocks in deprecation-staleness-runner.ts, deprecation-topics.ts, topics/already-built-topic.ts (preserve already-built's `0` early-return). Test: raw parser returns `{}` on corrupt, parsed on valid.

**Commit 5 — Dead export.** Remove unused exported `useActivityStatus` from `useSprintBoard.ts` (collides with real one in ActivityContext). Drop `ActivityLogEntry` import if now unused.

**Commit 6 — SWR error semantics (app-wide, isolate this commit).** `SWRProvider.tsx` default `fetcher` throws on non-ok (align with `swrFetcher`). Soft consumers (`ActivityContext`, `activity-helpers`) use `swrFetcher` directly → unaffected. `useSidebarData` reads `data` only → throw routes to `error`, count stays `null` → OK. Test: mock fetch ok:false → fetcher rejects.

**Commit 7 — isEpicChild consolidation.** Move the `"storyPoints" in child` guard to `epic-children-grouping.ts`, import in EpicChildrenSection / EpicChildrenBySprint / EpicProgressToolbar. Test: guard true/false cases.

**Commit 8 — Timers/SSE (last, most side-effecting).** `useBulkSuggest.ts` copy-toast `setTimeout` → track in ref, clear on unmount + before re-schedule. `event-bus.ts` SSE reconnect → capped exponential backoff, reset on successful open. No AC-required tests.

## Acceptance Criteria

- [x] A failed `finalizeDraft` marks the draft `DRAFT_FAILED` (the `.run()` executes).
- [x] A corrupt `*_last_result` / `lastResult` row no longer breaks the Scheduled Jobs / System
      Tasks status views (guarded parse).
- [x] `formatTimestamp` returns empty (not "Invalid Date") on unparseable input.
- [x] `adf-to-markdown` renders headerless tables correctly (no phantom header row), with no dead branch.
- [~] Team-prefix extraction, `isEpicChild`, and `scanScores` parsing each live in one place. (team-prefix + scanScores done; isEpicChild pending)
- [ ] The dead `useActivityStatus` export and `backlog` state key are removed.
- [ ] SWR errors surface for keys on the default fetcher; the intentional soft consumers still work.

## Tests

- [ ] `draft-sync` test: a finalize failure leaves the row `DRAFT_FAILED`.
- [x] `scheduler`/`task-registry`: a corrupt stored value yields `null`, not a thrown status call.
- [x] `format-timestamp`: bad input → `""`.
- [x] `adf-to-markdown`: a headerless table renders without a separator row.
- [~] Consolidated `extractTeamPrefix`/`isEpicChild`/`scanScores` keep existing call-site behaviour. (team-prefix + scanScores done; isEpicChild pending)
- [ ] SWR fetcher: a non-ok response surfaces an SWR `error` for a default-fetcher key.

## Open Questions

- **`adf-to-markdown` table semantics.** Collapse to "always header" (current effective behaviour,
  simplest) vs. implement true headerless rendering. Recommend collapse unless headerless tables
  are common in synced content.
- **SWR fetcher change scope.** Confirm the soft consumers (`useSidebarData` count, `ActivityContext`)
  are the only intentional null-on-error keys before flipping the default to throw.

## Related

- [[2026-06-22-codebase-audit]] — source audit (Robustness & dead code).
- Touch points: `draft-sync.ts`, `scheduler.ts`, `task-registry.ts`, `format-timestamp.ts`,
  `adf-to-markdown.ts`, `sprint-utils.ts`, `epic-children-grouping.ts`, the `EpicChildren*` guard
  sites, `useSprintBoard.ts`, `SWRProvider.tsx`, `cleanup-types.ts`, `useBulkSuggest.ts`, `event-bus.ts`.
