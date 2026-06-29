# Pre-existing issues found during BRDG-235

Date: 2026-05-29
Context: Encountered while running final verification for BRDG-235 (hover card). Neither is caused by that change; logging for follow-up.

## 1. `src/lib/rate-limiter.test.ts` is flaky under the full suite

- `npm run test` (full suite) reported **7 failures**, all in `src/lib/rate-limiter.test.ts`, e.g. `delete tier > uses separate bucket from write tier` expecting a `429` after N calls.
- Running the file in isolation passes cleanly: `npx vitest run src/lib/rate-limiter.test.ts` → **16/16 passed**.
- Conclusion: the rate limiter keeps in-memory bucket state keyed on wall-clock time windows. Under full-suite load the timing window rolls over (or shared module state leaks across files), so the counts don't line up. Order/timing dependent, not deterministic.
- Suggested fix: inject a clock / use fake timers inside the rate-limiter tests and reset the limiter's in-memory state in `beforeEach`, so the tests don't depend on real elapsed time or suite ordering.

## 2. `next build` fails on a stale `.next/types` reference

- `npm run build` failed with: `Cannot find module '../../../../../../src/app/api/debug/query-stats/route.js'` from a generated `.next/types/app/api/debug/query-stats/route.ts`.
- Root cause: `src/app/api/debug/query-stats/route.ts` is a **staged deletion** (`git status` shows `D`), but a stale `.next/` cache from a prior dev run still referenced it. The dev server (port 3100) was running and writing `.next/`, so the build picked up stale generated types (and `rm -rf .next` failed with "Directory not empty" while the server held files).
- Workaround that worked: stop the dev server (`lsof -ti:3100 | xargs kill -9`), `rm -rf .next`, then `npm run build` → succeeds.
- Suggested follow-up: confirm the staged deletion of `query-stats/route.ts` is intentional and commit it; document that a clean `next build` should not be run while the dev server is using the same `.next` directory.
