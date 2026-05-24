# BRDG-175: Optimize /implement-story Workflow Performance

**Status:** Open
**Priority:** Medium

## Description

The `/implement-story` skill currently takes 30+ minutes for a straightforward story (BRDG-172 took 32 minutes). Most of this time is spent on browser automation verification, sequential verification steps, and high-effort thinking loops. The workflow should complete in under 15 minutes for a typical story.

## Investigation Findings

### Root Cause Breakdown (estimated for BRDG-172)

| Phase | Time | Notes |
|-------|------|-------|
| Planning subagent | 2-3 min | Blocking sync call to Plan agent |
| Implementation | 3-5 min | Actual code writing |
| Sequential checks (lint, typecheck, test) | 2-3 min | Runs sequentially, could overlap |
| Build | 1-2 min | 133+ routes, 494MB output |
| Browser automation | 15-25 min | Auth redirects, wait cycles, screenshot retries |
| **Total** | **~32 min** | |

### Bottleneck 1: Browser automation (biggest factor)

The visual verification step uses Chrome MCP tools with multiple sequential operations:
- `tabs_context_mcp` + `tabs_create_mcp` + `navigate` + `wait` (3-4s each) + `screenshot`
- Auth session expires after dev server restart, causing redirects to `/login`
- No timeout/retry limits: failed screenshots are retried indefinitely
- Direct URL navigation to `/tickets/[key]` fails, requiring roundabout navigation through the sprint board

### Bottleneck 2: Sequential verification commands

The workflow runs 4 commands strictly in sequence:
1. `npm run lint` (~5s)
2. `npm run typecheck` (~10s)
3. `npm run test` (~60s for 209 test files in jsdom)
4. `npm run build` (~30-60s for 133+ routes)

These could partially overlap (lint + typecheck can run in parallel).

### Bottleneck 3: Full test suite on every verification

`npx vitest run` executes all 209 test files regardless of which files changed. Vitest supports `--changed` or path filtering to run only affected tests.

### Bottleneck 4: Dev server restart after build

Running `npm run build` and then visual verification requires restarting the dev server, which invalidates Clerk auth sessions in the browser.

## Implementation Plan

1. **Add `bail: 5` to vitest config** - `vitest.config.ts`
2. **Add `// @vitest-environment node` to API route tests** - ~77 files in `src/app/api/**/*.test.ts` plus applicable `src/lib/*.test.ts` and `src/services/*.test.ts`
3. **Add `npm run verify` script** - `package.json` - shell-level parallel lint+typecheck, then test
4. **Update per-checkbox verification in workflow** - `.claude/commands/implement-story.md` - parallel lint+typecheck, targeted tests, skip build
5. **Update final verification in workflow** - `.claude/commands/implement-story.md` - use `npm run verify`, restructure steps
6. **Add browser automation improvements to workflow** - `.claude/commands/implement-story.md` - skip for non-UI, navigate via app, retry limits, keep dev server
7. **Run full verification** - confirm all changes work together

## Acceptance Criteria

### Workflow optimizations

- [x] Run `lint` and `typecheck` in parallel (both are read-only)
- [x] Use `npx vitest run --changed` or pass specific test file paths to only run affected tests during implementation (full suite in final verification only)
- [x] Skip `npm run build` during per-checkbox verification; only run it in final verification
- [x] Add a `npm run verify` script that runs lint + typecheck + test in an optimized way

### Browser automation improvements

- [x] Skip browser visual verification for non-UI stories (API-only, backend changes)
- [x] For UI stories, navigate through the app (click from sprint board) instead of direct URL navigation (avoids Clerk redirect)
- [x] Add max-attempt limits for screenshot retries (3 attempts max, then report and continue)
- [x] Do not restart the dev server unnecessarily between checks (keep it running)

### Test performance

- [x] Add `bail: 5` to vitest config so test runs fail fast on widespread breakage
- [x] Evaluate switching API route tests from `jsdom` to `node` environment (they don't need DOM)

## Technical Notes

- The workflow definition lives in `.claude/commands/implement-story.md`
- Vitest config: `vitest.config.ts`
- Build produces 494MB in `.next/` across 133+ routes
- Test suite: 209 files, ~60s runtime, all using jsdom environment
- Authentication: Clerk, session-based, invalidated on server restart

## Out of Scope

- Reducing the number of routes or tests (those exist for good reasons)
- Changing the Clerk auth flow
- Switching to a different test framework
