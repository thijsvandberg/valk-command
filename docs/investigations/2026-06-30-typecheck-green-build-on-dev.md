# Pre-existing `npm run typecheck` failure on `dev` that `npm run build` does not catch

**Date:** 2026-06-30
**Found during:** BRDG-444 (Open in Bridge Chrome extension) final verification.
**Scope:** Observation only. Not fixed here (outside BRDG-444 scope; the file is
unrelated to the extension work).

## What I observed

Running the checks against a clean `dev` HEAD (commit `b609ecdf`, plus only the
BRDG-444 plain-JS extension, which adds zero `.ts` files):

- `npm run lint` -> 0 errors (2 pre-existing warnings in
  `src/components/sprint-board/ticket-action-menu.tsx`).
- `npm run build` -> **exit 0, succeeds**.
- `npm run typecheck` (`tsc --noEmit`) -> **fails**:
  ```
  src/hooks/useTicketDetailPage.test.ts(271,67): error TS2741:
    Property 'description' is missing in type '{}' but required in type
    '{ description: { value: string; isDraft: boolean; modifiedAt: string; } }'.
  ```

This error is committed on `dev` and is independent of BRDG-444.

## Why build is green but typecheck is red

`next build`'s "Checking validity of types" step only type-checks files reachable
from the app/page graph. Co-located `*.test.ts(x)` files are not imported by any
page, so the build effectively skips them. `tsc --noEmit` (what `npm run typecheck`
and `npm run verify` run) checks **every** file in the tsconfig `include`
(`**/*.ts(x)`), including test files, so it catches the stale test fixture.

## Why this matters

- The required CI status check on `main` is `build` (per CLAUDE.md). Build is green,
  so a stale **test-file** type error can reach `main` without CI flagging it, while
  `npm run verify` (the documented pre-commit gate) goes red.
- Anyone running `npm run typecheck` / `npm run verify` on `dev` right now hits a
  red typecheck that has nothing to do with their change, which is noisy and erodes
  trust in the gate.

## Suggested follow-up (not done here)

- Fix the `useTicketDetailPage.test.ts:271` fixture to include the required
  `description` field (a one-line test fixture fix).
- Optionally make CI run `npm run typecheck` (not just `build`) as a required check
  so stale test types are caught before merge.

## Note on parallel work

At the time of writing, the working tree also carried uncommitted parallel work
(BRDG-446 statusline / `StatusChange*`), which added two further `tsc` errors in
`StatusChangeLine.test.tsx` and `useStatusChanges.test.ts`. Those are separate from
the committed `useTicketDetailPage.test.ts` error above and presumably resolve when
that work lands.
