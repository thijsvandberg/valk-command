# Pre-existing `tsc --noEmit` error in `useTicketDetailPage.test.ts`

**Date:** 2026-06-30
**Found during:** BRDG-441 implementation (inbox header + aligned select-all)

## Finding

`npm run typecheck` (`tsc --noEmit`) fails on the `dev` branch with:

```
src/hooks/useTicketDetailPage.test.ts(271,67): error TS2741: Property 'description' is missing in type '{}' but required in type '{ description: { value: string; isDraft: boolean; modifiedAt: string; }; }'.
```

This is **unrelated to BRDG-441**. Confirmed by checking out the BRDG-441 commit (`a75a5e71`) into a **clean git worktree** (no parallel uncommitted work) and running `tsc --noEmit` there — the error still appears, and no error points at any BRDG-441 file (`src/app/(app)/inbox/page.tsx`, `src/components/sprint-board/GroupStatBar.tsx`, or their test files). So the failure is latent on `dev` at HEAD, independent of the current working-tree changes.

## Why it matters

`npm run build` is **green** despite this, because `next build` does not type-check orphan `*.test.ts` files that aren't imported by the app graph. Branch protection on `main` only requires the `build` check (see CLAUDE.md), so this red `tsc` would not block a promote — matching the "Build green != typecheck green" pattern.

## Suggested fix (out of scope for BRDG-441)

The test at `useTicketDetailPage.test.ts:271` constructs an object literal `{}` where the typed shape requires a `description: { value; isDraft; modifiedAt }` field. Add the missing `description` to that test fixture (or mark it optional in the shared type if the production code tolerates its absence). A small, isolated fix — best handled as its own change so it doesn't ride along with unrelated work.
