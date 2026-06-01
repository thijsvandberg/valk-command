# EpicChildrenSection.test.tsx failing on `dev` (pre-existing)

**Date:** 2026-06-01
**Found during:** BRDG-242 implementation (final verification)

## Summary

`src/components/ticket-detail/EpicChildrenSection.test.tsx` has 5 failing tests on the `dev` branch, unrelated to BRDG-242. Confirmed by stashing all BRDG-242 changes (including untracked files) and running the test against the clean tree: it still fails identically (5 failed | 4 passed).

## Failing tests

- `inline creation > renders input below existing items`
- `inline creation > creates child issue on Enter`
- `inline creation > shows placeholder row during creation`
- `inline creation > shows error on creation failure`
- `type selector > shows type picker on click and selects a type`

## Root cause

```
Error: [vitest] No "swrFetcher" export is defined on the "@/lib/api-client" mock.
 ❯ useTickets src/hooks/useSprintBoard.ts:58:37
```

The test mocks `@/lib/api-client` but omits the `swrFetcher` export. A render path in these specific cases reaches `useTickets` (via `useSprintBoard`), which calls `swrFetcher`, so the incomplete mock throws. The 4 passing tests in the same file don't hit that path.

## Suggested fix (out of BRDG-242 scope)

Add `swrFetcher` to the `vi.mock("@/lib/api-client", ...)` in `EpicChildrenSection.test.tsx` (e.g. `swrFetcher: vi.fn()`), or use `importOriginal` to partially mock the module.

## Note

This also makes the full `npm run test` run appear flaky: depending on worker scheduling, the swrFetcher error can surface in a cascading render of `ChildIssueRow` (rendered by `EpicChildrenSection`) rather than the source file, so the reported failing file varies between runs.
