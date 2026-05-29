# Implementation Performance Log

## BRDG-235 — Hover card on TicketStatusPill (2026-05-29)

Implementation itself was smooth (one component + two call-sites + tests, all green
first try). Final verification hit two unrelated blockers.

| Phase | Notes |
|-------|-------|
| Plan | Opus Plan subagent; clean numbered plan, no rework. |
| Implementation | One edit pass to `TicketStatusPill.tsx` + 2 call-sites; one lint error (setState-in-effect) fixed by deriving visibility instead of an effect. |
| Test verification | Added 7 hover-card tests; affected files 34/34 pass. |
| Final verification | Full suite + build, then browser visual check. |

Key bottlenecks (both pre-existing, neither caused by the change — see
`docs/investigations/2026-05-29-flaky-rate-limiter-and-stale-next-build.md`):

- **Stale `.next` build failure**: `next build` failed on a generated type referencing
  a deleted route (`api/debug/query-stats`). The running dev server held `.next`, so
  `rm -rf .next` also failed. Fix: kill port 3100, clean `.next`, rebuild.
- **Flaky `rate-limiter.test.ts`**: 7 failures in the full suite, 16/16 in isolation —
  time-window/global-state dependent, unrelated to this story.

## BRDG-231 — Fix Dependency Vulnerabilities (2026-05-29)

The dependency bump itself was trivial (one package), but verification hit three
unrelated blockers that required extra diagnosis runs.

| Phase | Notes |
|-------|-------|
| Investigation | Quick — determined both highs trace to one js-cookie/Clerk chain; drizzle-kit/next already at latest stable. |
| Implementation | Single `npm install`; lint/typecheck/build all clean first try. |
| Test verification | 3 full suite runs (~63s each) to diagnose two different failures. |

Key bottlenecks (all pre-existing / external, none caused by the change):

- **Pre-existing Drizzle schema drift**: a clean checkout already emits an index-change
  migration, so the AC's "generate produces no diff" could not be met verbatim. Logged
  in `docs/investigations/2026-05-29-drizzle-schema-drift.md`.
- **Non-deterministic test flakiness**: different unrelated tests fail across full runs
  under parallel workers (e.g. `sync-comments/route.test.ts`), all pass in isolation.
- **External untracked file**: `src/app/(app)/dev/ticket-pills/page.tsx` appeared mid-session
  from an external process and breaks `routes.test.tsx` (not in the route manifest). Left
  untouched as out of scope.
