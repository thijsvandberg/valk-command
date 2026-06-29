# RecentlyViewedView "Today/Yesterday/Earlier" test is midnight-flaky

**Date:** 2026-06-17
**Found during:** BRDG-359 implementation (final `npm run verify`)
**Status:** Observed, not fixed (out of scope for BRDG-359)

## Symptom

`src/components/nav/RecentlyViewedView.test.tsx` → "groups entries by day with
Today / Yesterday / Earlier headers" failed with `getByText("Today")` not found.
Re-running in isolation reproduced it. Every other test (6106) passed.

## Root cause

The test seeds entries with offsets relative to the real clock:

```ts
{ key: "VPL-1", title: "Fresh", agoMs: 5 * 60 * 1000 },   // "today"
{ key: "VPL-2", title: "From yesterday", agoMs: 24 * HOUR },
{ key: "VPL-3", title: "Old", agoMs: 4 * 24 * HOUR },
```

The grouping logic buckets by **calendar day**, but the test does not freeze
time (`vi.useFakeTimers`/`vi.setSystemTime`). When the suite runs in the first
few minutes after local midnight (this run started at 00:02), the "5 minutes
ago" entry resolves to **23:57 of the previous calendar day**, so there are zero
"Today" entries and the "Today" header is never rendered.

This is unrelated to BRDG-359 (the test is localStorage-only, touches no DB or
inbox code) and only fails in the ~00:00–00:05 window.

## Suggested fix (separate change)

Freeze the clock in the test, e.g. `vi.setSystemTime(new Date("2026-06-17T12:00:00Z"))`
in `beforeEach` (and `vi.useRealTimers()` after), so "5 minutes ago" is reliably
on the same calendar day as "now". Apply the same guard to the other
relative-time assertions in the file ("5m" age row) if they prove flaky.
