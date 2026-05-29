# Implementation Performance Log

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
