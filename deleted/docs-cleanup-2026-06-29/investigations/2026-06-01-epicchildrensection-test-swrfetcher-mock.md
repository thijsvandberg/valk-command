# EpicChildrenSection tests fail: missing `swrFetcher` in api-client mock

**Date:** 2026-06-01
**Found during:** BRDG-244 (inline code toolbar button) final verification
**Status:** Pre-existing, unrelated to BRDG-244

## Summary

5 tests in `src/components/ticket-detail/EpicChildrenSection.test.tsx` fail on the `dev` branch, independent of BRDG-244 (confirmed: they fail identically with the BRDG-244 changes reverted).

Failing tests:
- `inline creation > renders input below existing items`
- `inline creation > creates child issue on Enter`
- `inline creation > shows placeholder row during creation`
- `inline creation > shows error on creation failure`
- `type selector > shows type picker on click and selects a type`

## Root cause

```
Error: [vitest] No "swrFetcher" export is defined on the "@/lib/api-client" mock.
Did you forget to return it from "vi.mock"?
```

The test mocks `@/lib/api-client` but does not export `swrFetcher`. The component tree now reaches `swrFetcher` at render time via `ChildIssueRow` -> `useTicketHoverData` -> `useSprintBoard` (`useSWR(key, swrFetcher, ...)` in `src/hooks/useSprintBoard.ts:58`). The mock predates that dependency, so the import resolves to `undefined` and the render throws.

## Suggested fix

Add `swrFetcher` to the `vi.mock("@/lib/api-client", ...)` factory in `EpicChildrenSection.test.tsx` (a `vi.fn()` returning a resolved value is enough), or use `importOriginal` to partially mock. This is a test-only fix; the component code is fine.

## Scope note

Left unfixed here to stay within BRDG-244 scope. Worth a small follow-up (test infrastructure / tech debt).
