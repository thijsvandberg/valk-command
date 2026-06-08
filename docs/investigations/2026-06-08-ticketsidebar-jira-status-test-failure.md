# Pre-existing test failure: TicketSidebar "displays Jira status"

**Date:** 2026-06-08
**Found during:** BRDG-308 final verification (`npm run verify`)
**Scope:** Out of scope for BRDG-308 — logged, not fixed.
**Still present:** Reconfirmed during BRDG-311 verification (same single failure, reproduces in isolation on files untouched by BRDG-311). Still unfixed, still out of scope.

## Symptom

`src/components/ticket-detail/TicketSidebar.test.tsx > TicketSidebar > displays Jira status`
(line 223) fails:

```
renderSidebar({ ticket: { jiraStatus: "IN PROGRESS" } });
expect(screen.getByText("IN PROGRESS")).toBeInTheDocument();
```

`getByText("IN PROGRESS")` finds no matching element. The rendered DOM shows a
`data-testid="dev-panel"` and other sidebar content, but no node with the literal text
`IN PROGRESS`.

## Confirmed pre-existing and unrelated to BRDG-308

- BRDG-308 only touched `src/lib/sprint-cache.ts` and `src/app/api/jira/sprints/route.ts`
  (plus their tests). Neither is imported by `TicketSidebar`.
- With the BRDG-308 changes stashed, the full suite still fails this one test
  (1 failed / 4988 passed).
- With the unrelated parallel working-tree changes (`EpicStatsSummary.tsx/.test.tsx`) also
  stashed, the test still fails on clean `HEAD` (commit `23369015`).
- The full suite otherwise passes (479 files / ~4993 tests). One transient second failure
  appeared on the first verify run but did not reproduce — likely a flaky test.

## Likely cause (needs confirmation)

The status almost certainly now renders via a badge/pill component (e.g. `StatusBadge`) that
maps `IN PROGRESS` to a styled label, possibly splitting the text across nodes or transforming
casing, so a literal `getByText("IN PROGRESS")` no longer matches. The assertion likely needs
updating to query the badge by role/test-id or with a normalized matcher — i.e. a stale test,
not a product regression. Should be verified against the current `TicketSidebar` rendering before
changing either side.

## Recommendation

Small, isolated fix to the test (or the badge's accessible text) under its own change. Not bundled
into BRDG-308 because it is unrelated and the project rule is to not touch code outside the current
task scope without discussion.
