# Date-dependent failing test: useInboxGroupBy "defaults to date grouping"

**Date:** 2026-06-17
**Found during:** BRDG-349 final verification (unrelated to that story)
**Owner area:** BRDG-358 (`useInboxGroupBy`)

## Finding

`src/components/sprint-board/useInboxGroupBy.test.ts` > "defaults to date grouping" fails:

```
AssertionError: expected 'yesterday' to be 'today'
```

The test's fixture row hardcodes `jiraCreatedAt: "2026-06-16T08:00:00Z"` (see the `row()` helper default). The assertion expects the first date group key to be `"today"`. This only held while the suite ran on or near 2026-06-16. Now that the current date is 2026-06-17, that timestamp buckets as `"yesterday"`, so the assertion fails.

It is a time-bomb test: it passes around its authored date and silently rots afterwards. It is **not** caused by BRDG-349 (which only touches Jira push content-limit feedback in the ticket detail editor, the service guard, and the API client error type).

## Suggested fix (for the BRDG-358 owner)

Make the fixture relative to the current day instead of a fixed string, e.g. derive `jiraCreatedAt` from `new Date()` at start-of-day in the `row()` helper (or inject a clock), so "today" grouping is asserted against an actually-today timestamp. Apply the same to any sibling assertions that depend on the literal date.

## Impact

- Full `npm run test` / `npm run verify` shows 1 failing test regardless of unrelated work, which can mask real regressions in CI and local runs.
- Build is unaffected (`npm run build` passes).
