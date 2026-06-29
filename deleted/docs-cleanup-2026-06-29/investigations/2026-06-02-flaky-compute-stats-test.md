# Flaky test: activity-log compute-stats ordering

**Date:** 2026-06-02
**Found during:** BRDG-247 implementation (final `npm run verify`)

## Symptom

In the full test run, `src/app/api/activity-log/compute-stats.test.ts > computeRecurringFailures > collects unique affected scopes` intermittently fails:

```
expected [ 'VPL-2', 'VPL-1' ] to deeply equal [ 'VPL-1', 'VPL-2' ]
```

The test asserts `result[0].affectedScopes` equals `["VPL-1", "VPL-2"]`, but the produced order is sometimes reversed.

## Findings

- The test **passes in isolation** (`npx vitest run src/app/api/activity-log/compute-stats.test.ts` → 22/22) and only fails inside the full parallel suite, so this is test-pollution / order-nondeterminism, not a regression from BRDG-247.
- BRDG-247 touches only `renderMarkdown`, `TicketStatusPill`/`TicketRefPill`, env config, and `EditableDescription` — none related to activity-log stats. Running the new BRDG-247 tests alongside `compute-stats.test.ts` does **not** reproduce the failure.
- Root cause is almost certainly that `affectedScopes` is built from a `Set` (or similar unordered collection) whose iteration order depends on insertion order, and the source rows reach `computeRecurringFailures` in a nondeterministic order when global state is shared across the suite.

## Suggested fix (not done here — out of BRDG-247 scope)

Make the assertion order-independent (e.g. compare sorted arrays or use `expect.arrayContaining` + length), or sort `affectedScopes` deterministically in the source before returning. Belongs in a small test-stability ticket, not this story.
