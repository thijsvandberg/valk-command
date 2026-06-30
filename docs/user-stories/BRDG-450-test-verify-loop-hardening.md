# BRDG-450: Eliminate phantom test failures + jira-client mock fragility

**Status:** To Do
**Priority:** Medium
**Type:** Chore (test/DX tooling)

## Description

Two recurring sources of wasted verify cycles, both surfaced repeatedly in `docs/performance-log.md`. They are independent and could be split, but are bundled here as one "harden the verify loop" story with two parts.

- **Part A — Stabilize the test/verify pipeline.** Phantom test failures (failures that do not reproduce in a clean single run) keep sending sessions down bisect rabbit holes. Two root causes: the full test suite can run as two concurrent processes on the 16GB machine (the auto-test hook plus a manual run), and `bail: 5` hides the true blast radius of a failing run. Goal: one test process at a time becomes a guarantee, not a discipline; a failing run shows every failure, not the first five.
- **Part B — One source-of-truth jira-client mock.** Adding an export to `@/lib/jira-client` silently breaks unrelated test files because most of them hand-roll their own inline mock. Goal: adding a jira-client export breaks exactly one guard test pointing at one file to update, never a scattered set of route tests.

Neither part changes any product behaviour or what is tested.

## Current Behaviour

**Part A**

- `vitest.config.ts` sets `bail: 5` and uses the default jsdom worker pool (no `maxWorkers` / `fileParallelism` cap). The suite is ~639 test files. <!-- vitest.config.ts:12 -->
- `npm run verify` runs `lint` and `typecheck` in parallel, then `vitest run`. `npm run test` is `vitest run`. <!-- package.json:14-15 -->
- The `PostToolUse` hook runs the **full** `npm run test` after every `Edit`/`Write` of a `.ts/.tsx/.js/.jsx` file. It guards with a `mkdir /tmp/valk-test.lock` (stale lock >1 min auto-removed) and skips with "Test already running, skipped" if the lock is held. <!-- .claude/settings.json:47-58 -->
- The lock is taken **only by the hook**. A manual/agent `npm run test` or `npm run verify` does not acquire it, so hook + manual = two concurrent `vitest` processes → OOM/contention → phantom failures on the 16GB box. `CLAUDE.md` mandates "only ONE test process at a time" but enforcement is by discipline alone. Logged in BRDG-413, BRDG-439; the file-parallelism OOM is logged in BRDG-343 (needed `--no-file-parallelism`).
- `bail: 5` stopping the run after 5 failures repeatedly masked which failures belonged to the session vs. parallel work on the shared tree (BRDG-338, BRDG-320, BRDG-343, BRDG-438).

**Part B**

- A complete shared mock factory already exists: `createJiraClientMock(overrides?)` in `src/test/mocks/jira-client.ts`. It returns the full `jiraClient` object, the field-name consts, the `extract*`/`filter*` helpers, and `JiraApiError`, and accepts per-test overrides. <!-- src/test/mocks/jira-client.ts:12 -->
- **58 test files** `vi.mock("@/lib/jira-client", ...)`, but only **7** use the factory. The other **51** hand-roll an inline mock object listing just the methods that one test touches. <!-- e.g. src/app/api/jira/link-types/route.test.ts -->
- Because `vi.mock` fully replaces the real module, when code-under-test (e.g. `upsertIssue`) starts calling a **new** jira-client export, every inline mock that omits it returns `undefined` for that export → the real code throws → those route tests fail with confusing shapes (`data.count` undefined, etc.). The shared factory also has to be hand-updated for each new export. Logged in BRDG-414, BRDG-439, BRDG-413.

## Proposed Approach

### Part A — serialize runs + show full blast radius

1. **One lock for every test run.** Add a small lock-guarded wrapper script under `tools/scripts/` (e.g. `run-tests.sh`) that acquires `/tmp/valk-test.lock`, runs `vitest run "$@"`, and releases it. Point both `npm run test` and the `PostToolUse` hook at this wrapper. With both paths sharing one lock, a hook run and a manual run can never start two `vitest` processes — `CLAUDE.md`'s "one test process at a time" becomes a guarantee. <!-- package.json:14 + .claude/settings.json:53 -->
2. **Remove `bail: 5`** (or raise it far beyond the suite size) so a failing run reports every failure. The runtime cost only applies when tests are already failing; the benefit is correct attribution of session-vs-parallel failures. <!-- vitest.config.ts:12 -->
3. **Cap worker concurrency for the 16GB box** via `test.poolOptions`/`maxWorkers` (or document `fileParallelism`) so heavy jsdom files cannot OOM/hang the machine (BRDG-343). <!-- vitest.config.ts test block -->

Non-goals: changing what is tested; touching the CI workflow; the worktree-isolation workflow change (separate, priority #1 in the analysis — not this story).

### Part B — converge on the shared factory + guard it

1. **Add a completeness guard test** mirroring the existing source-scanning guard style, asserting `createJiraClientMock()` exposes every export of `@/lib/jira-client` (and every `jiraClient` method). Adding an export then fails exactly one named test pointing at `src/test/mocks/jira-client.ts`. <!-- new src/test/mocks/jira-client-guard.test.ts, pattern of src/components/shared/menu-button-guard.test.ts -->
2. **Migrate the 51 roll-their-own mock sites** to `createJiraClientMock({ jiraClient: { ... } })`, moving any per-test customization into the `overrides` argument. This is the step that actually delivers the goal: the guard alone only protects files that already use the factory; the 51 inline mocks keep breaking individually until migrated. <!-- the 51 files listed by: grep -rln 'vi.mock("@/lib/jira-client"' src | xargs grep -L createJiraClientMock -->

Non-goals: changing `@/lib/jira-client` itself; collapsing tests that mock jira-client for unrelated reasons.

## Open Questions

- **A — lock contention behaviour.** When a run is already in progress, should the second run wait or skip? Recommended default: the **hook skips** (prints "test already running, skipped" as today, since it will re-fire on the next edit); a **manual `npm run test` waits** for the lock so an agent's explicit verify still completes. Implementer's call; affects only the wrapper script.
- **A — hook scope (full vs related).** Should the hook keep running the full ~639-file suite on every edit, or switch to `vitest related <edited file>` for faster, lighter feedback (full suite stays the manual/verify gate)? Recommended default: **switch to related-only** — far less load and collision surface, still honours "run tests after editing". Caveat: requires parsing the edited file path out of the hook's `$TOOL_INPUT`. If parsing is fragile, keep full-suite + the lock from step 1 (which already removes the collision).
- **B — migration size.** Migrate all 51 in this story, or land the factory + guard now and migrate opportunistically? Recommended default: **migrate all now** — guard-test-only does not meet the goal, because un-migrated inline mocks still break one-by-one when a new export lands.

## Implementation Plan

Order is chosen to avoid a self-referential deadlock: the currently-loaded PostToolUse hook fires `npm run test` on every `.ts` edit this session and cannot be reloaded mid-session, so all `.ts`-heavy work happens while `npm run test` is still plain `vitest run`, and the test-runner plumbing is swapped **last**.

1. **A2 — `vitest.config.ts`**: remove `bail`, add `poolOptions.forks.maxForks` (start at 4). Config-only; old hook still runs plain `vitest run`.
2. **Extend the factory** `src/test/mocks/jira-client.ts`: add the **7** real exports it currently omits (`redactJiraPath`, `_resetRateWarn`, `_requestTimestamps`, `_noteRateLimitApproaching`, `issuePath`, `selectPrimarySprint`, `JiraClient`) as inert/safe stubs; make `jiraClient.isLive` a writable data property (not a getter) so runtime reassignment in tests works; widen `overrides` to accept top-level helper overrides (not just `jiraClient`/`isLive`).
3. **B2 — migrate the 52 inline-mock files** to `createJiraClientMock({...})` in directory batches (`api/jira/*`, `api/tickets/**`, `api/*`, `lib/*`, `services/*`); the 5 field-const files + `ticket-detail-builder.test.ts` (custom `undefined`/fake-field values) get a careful batch. One scoped `npx vitest run <batch>` per batch, never two runs at once.
4. **B1 — completeness guard** `src/test/mocks/jira-client.guard.test.ts`: dynamic `import * as real` superset check (factory keys ⊇ every runtime export, underscore hooks included); no instance-method reflection. Plus the **AC5 source-scan guard** (every `*.test.*` that mocks `@/lib/jira-client` references `createJiraClientMock`, explicit `ALLOWED` exceptions).
5. **A1 — plumbing, LAST**: `tools/scripts/run-tests.sh` (lock `/tmp/valk-vitest.lock` — distinct name avoids this-session reentrancy; `skip` mode for hook, `wait` mode for manual; mkdir lock, stale-clear >1min, exit-code passthrough); repoint `package.json` `"test"` → wrapper `wait`; rewrite the `.claude/settings.json` hook → wrapper `skip` with `vitest related <edited file>` + full-suite fallback. After this, make no further `.ts` edits; run final verify as a single manual run.

## Acceptance Criteria

- [ ] A hook-triggered test run and a manual `npm run test` cannot run two `vitest` processes at once (both serialize through one lock). <!-- tools/scripts/run-tests.sh + .claude/settings.json:53 + package.json:14 -->
- [x] A failing full run reports all failures, not the first five. <!-- vitest.config.ts: bail removed -->
- [x] Heavy jsdom files no longer OOM/hang a full local run on the 16GB machine. <!-- vitest.config.ts: maxWorkers: 4 (vitest 4 top-level option; poolOptions.forks shape changed) -->
- [ ] Adding a new export to `@/lib/jira-client` fails a single named guard test that points at `src/test/mocks/jira-client.ts`, and no other test file. <!-- src/test/mocks/jira-client-guard.test.ts -->
- [ ] Every test file that mocks `@/lib/jira-client` uses `createJiraClientMock` (zero remaining roll-their-own inline mocks). <!-- grep -rln 'vi.mock("@/lib/jira-client"' src | xargs grep -L createJiraClientMock  → empty -->

## Tests

- [ ] Guard test: `createJiraClientMock()` covers every `@/lib/jira-client` export + every `jiraClient` method. <!-- src/test/mocks/jira-client-guard.test.ts -->
- [ ] Lock wrapper: a second invocation while the lock is held behaves per the decided default (skip/wait) and never starts a parallel `vitest`. <!-- tools/scripts/ test or a bats/shell assertion -->
- [ ] Full suite + build stay green after the migration (regression gate; the migration must not change any test's behaviour). <!-- npm run test && npm run build -->

## Related

- `docs/performance-log.md` — the analysis these two items came from (priority #2 and #3). Priority #1 (per-session git worktree isolation) is deliberately **not** in this story.
- BRDG-413, BRDG-439 — phantom failures from concurrent vitest processes; the "ONE test process at a time" rule.
- BRDG-343 — file-parallelism OOM on the 16GB box (`--no-file-parallelism`).
- BRDG-414, BRDG-439, BRDG-413 — adding a jira-client export breaking full-stub mocks.
- `src/components/shared/menu-button-guard.test.ts` (BRDG-421) — source-scanning guard-test pattern to mirror for the factory-completeness guard.
- `src/test/mocks/jira-client.ts` — the existing shared factory to converge on.
