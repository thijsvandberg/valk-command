# BRDG-335: Test suite redundancy & obsolescence cleanup

**Status:** To Do
**Priority:** Medium

## Description

The suite has grown to **523 test files**. This story captures the result of a read-only audit (no code changed) that looked for tests that are now redundant because:

- the source they cover no longer exists or behaves differently, or
- the source still exists but is **dead code** (nothing in production imports it), or
- **another test already covers the same flow** (duplicate-flow).

The audit was run as six parallel investigations (scheduled-tasks cluster, jira-client cluster, EpicChildren/TicketTable clusters, dead-code/legacy sweep, cross-layer route/service/page overlap, and a broad shared/ui/hooks sweep). Findings below are the verified conclusions; each was checked against the current source and import graph.

Good news first: there are **no skipped/`.todo` tests** (0 occurrences) and **no test imports a symbol the source no longer exports** (a full import-resolution scan came back clean). So there is no broken/silently-passing-on-removed-API rot. The redundancy is of two kinds: dead-code tests and duplicate-flow tests.

As a maintainer, I want the obsolete and duplicated tests removed (or slimmed) so the suite stays fast, honest about coverage, and cheap to maintain.

## Findings

### A. Dead-code tests (source exists but has ZERO non-test importers)

Each of these source files is imported only by its own co-located test. The test passes but covers code that nothing in production reaches. Confirmed by grep across `src` (excluding the test and the file itself). Per the global rule, source moves to `deleted/` rather than hard-delete.

| Source (move to `deleted/`) | Test to remove | Notes |
|---|---|---|
| `src/components/chat/ChatEmptyState.tsx` | `ChatEmptyState.test.tsx` | 0 importers |
| `src/components/chat/MessageDisplay.tsx` | `MessageDisplay.test.tsx` | Chat renders via `MessageList`, not this |
| `src/components/refinement-session/SessionStoryPointPicker.tsx` | `SessionStoryPointPicker.test.tsx` | 0 importers |
| `src/components/shared/GuestimationPicker.tsx` | `GuestimationPicker.test.tsx` | Replaced by `EstimatePicker`; only referenced in code comments |
| `src/components/shared/PageIntro.tsx` | `PageIntro.test.tsx` | 0 importers |
| `src/components/sprint-board/SprintInsights.tsx` | `SprintInsights.test.tsx` | Distinct from the live `SprintAnalytics`; not rendered anywhere |
| `src/components/story-diff/export-diff.ts` | `export-diff.test.ts` | 0 importers |
| `src/hooks/useIncrementalSync.ts` | `useIncrementalSync.test.ts` | 0 importers (the live incremental-sync logic lives in the `sync-incremental` route + `useSchedulerTick`/`usePipelineTick`, not this hook) |

> Decision needed per row: confirm the **source** can also be retired (recommended, since it is unreachable). If a source is being kept intentionally for near-future use, keep its test too and note why.

### B. Stale self-replicating test

| File | Issue | Recommendation |
|---|---|---|
| `src/components/story-writer/StoryWriterTitleSync.test.tsx` | Imports **no production code**; it defines a local copy of `useTitleSync` and its docstring says it "replicates the logic from `StoryWriterLayout`". That logic no longer lives in `StoryWriterLayout`; it moved to `src/components/story-writer/useStoryWriterActions.ts` (the `document.title` effect). The test asserts against a hand-copied duplicate, so it can never catch a regression in the real code. | **Retarget** it to exercise the real hook in `useStoryWriterActions.ts` (preferred, because no other test asserts on `document.title`), or delete if the title-sync assertion is not worth keeping. |

### C. Duplicate-flow tests (another test already covers the same flow)

| File / block | Overlaps with | Recommendation |
|---|---|---|
| `src/app/api/tickets/[key]/story-writer/messages/route.test.ts` -> `describe("hasEditIntent")` (approx. lines 341-399) | `src/lib/edit-intent.test.ts` (strict superset) | **Delete the block.** It calls `hasEditIntent()` directly and does not exercise the route at all. Keep the file's `describe("follow-up prompt optimization")` cases (those legitimately test the wired agent payload). |
| `src/app/api/jira/sync-tickets/route.test.ts` -> the "creates ticket rows / metadata rows / story_version rows", "re-sync without duplicating", "story-version dedup" cases | `src/lib/sync-tickets-service.test.ts` (`syncSprint`) + `src/lib/upsert-issue.test.ts` | **Slim to HTTP-only.** This route test does not mock the service, so it re-runs the real `syncSprint`/`upsertIssue` DB persistence already covered downstream. Keep the route's own logic: mode routing (`plan`/`reconcile`), zod validation (400 cases), `SyncValidationError` -> status mapping. Mock the service for the rest (mirror the exemplary `push-to-jira/route.test.ts` pattern). |
| `src/lib/deprecation-staleness-scan.test.ts` -> the scoring-detail blocks (comment-activity, epic-dampener; approx. lines 64-79, 94-109, 141-196, 200-256) | `src/lib/deprecation-staleness-runner.test.ts` (tests `scoreRows` directly, with near-identical fixtures) | **Merge/remove the scoring assertions.** `runDeprecationStalenessScan` delegates scoring to `scoreRows`. Keep only the wrapper-specific behavior here: backlog query/eligibility filter, cursor write + activity-log summary, empty-backlog short-circuit. |
| `src/lib/scheduled-tasks.test.ts` -> `it("skips when auto scan is disabled (baseline)")` (approx. lines 352-355) | `src/lib/deprecation-auto-enqueue.test.ts` ("does nothing when auto scan is disabled") | **Delete the baseline `it`.** Keep the adjacent subtask-exclusion case (that is unique). Optionally move it into `deprecation-auto-enqueue.test.ts` to consolidate all `runAutoEnqueue` coverage in one place. |

### D. Legacy-but-still-live chain (no action now; flag for later)

The `TicketRow` -> `DroppableSprintColumn` -> `MultiSprintView` -> `/sprint-board/compare` chain is **reachable** today (via the "Compare" button in `SprintBoardHeader`). It is the documented phase-out target (the main board uses `TicketTable` -> `BoardRow`). When the Compare feature is removed, the whole chain plus `TicketRow.test.tsx` becomes deletable together. **Not dead yet; do not remove in this story.**

## Explicitly verified as FINE (checked, no change)

- **jira-client cluster** (all 5: `jira-client.test.ts` + the 4 `*-sprint.test.ts`) - cleanly partitioned (main file = helpers + unconfigured mode; each `*-sprint` file = one write method's payload-merge in configured mode). All four sprint methods exist and have real callers. No overlap.
- **EpicChildrenSection cluster** (4 files) - split by flow with distinct mock strategies (main / optimistic / plan-sprint / reorder). No overlap.
- **TicketTable cluster** (`TicketTable`, `TicketTable.warning`, `TicketTableCells`, `warning-filter`) - distinct concerns; helpers have real callers.
- **story-writer-messages** split (`.test.ts` story-mode vs `.epic.test.ts` epic-mode) - complementary, not duplicate.
- **ChatMessageParts** two files (`ChatMessageParts.test.tsx` vs `RelatedStoriesInline.test.tsx`) - same source, disjoint exports.
- **push-to-jira route test** - exemplary unit/integration split (mocks the service, asserts only HTTP concerns).
- **Refinement** layering (route DB CRUD vs context/hook in-memory queue vs UI) - clean separation.
- Suspicious name-pairs all confirmed to target **different** sources: `chat/BulkActionBar` vs `sprint-board/BulkActionBar`; `sanitize` vs `sanitize-client` vs `sanitize-html-config`; `useLocalStorage` vs `useSessionStorage`; `cleanup-disposition` (helper / service / two routes); `markdown-to-adf` vs `adf-to-markdown` vs `normalize-markdown`; Picker/Option/Badge families.

## Acceptance Criteria

- [ ] Section A: confirm each of the 8 sources is truly unreachable, move source + test to `deleted/` (or keep with a documented reason).
- [ ] Section B: `StoryWriterTitleSync.test.tsx` either retargeted to `useStoryWriterActions.ts` (asserting real `document.title` behavior) or removed.
- [ ] Section C: the 4 duplicate-flow items removed/slimmed as described; the unique cases called out are retained.
- [ ] `npm run test` passes after the cleanup.
- [ ] `npm run lint`, `npm run typecheck`, and `npm run build` pass (removing dead source must not break imports anywhere).
- [ ] No reduction in **meaningful** coverage: every assertion removed is shown to be covered elsewhere (cite the file) or to cover dead code.

## Out of Scope

- The legacy `TicketRow`/`DroppableSprintColumn`/`MultiSprintView`/`/compare` chain (Section D) - remove only when the Compare feature itself is retired.
- Rewriting otherwise-healthy tests for style; this story only removes redundancy/obsolescence.
- Coverage gaps (tests that are *missing*) - this audit only looked for surplus, not absence.

## Notes on method

- 523 `*.test.{ts,tsx}` files. 0 `.skip`/`.todo`. Import-resolution scan over shared/ui/hooks/lib clean (no test references a removed export).
- "Dead code" = grep for the symbol across `src` excluding the test file and the source file itself returns no `import`/`from` usage; self-registering topic modules (loaded via `import "@/lib/topics"` for side-effects) were checked and are NOT dead.
