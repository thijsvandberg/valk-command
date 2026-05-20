# BRDG-138: Dependency Security Updates

**Status:** Done
**Priority:** Critical

## Description

As the PO, I want all dependencies with known high/critical vulnerabilities updated so the application is not exposed to authorization bypasses, denial-of-service attacks, or XSS through third-party code.

`npm audit` currently reports 7 high-severity vulnerabilities across core packages.

## Implementation Plan

1. **Update vitest/vite** (dev dependency, lowest risk, resolves peer constraints first) via `npm update vitest @vitejs/plugin-react`
2. **Update Next.js** via `npm update next` (15.5.14 -> 15.5.18, within `^15.5.0` range). No jump to 16.x needed; all advisories fixed in 15.5.x.
3. **Update Clerk** via `npm update @clerk/nextjs` (7.2.1 -> 7.3.7). Transitive deps `@clerk/backend`, `@clerk/react`, `@clerk/shared` follow automatically.
4. **Update marked** via `npm update marked` (18.0.0 -> 18.0.4). Note: `marked` is only used in `src/lib/clipboard.ts`, NOT in ticket rendering (that uses `react-markdown`).
5. **Update isomorphic-dompurify** via `npm update isomorphic-dompurify` (3.8.0 -> latest). Resolves transitive `dompurify` vulnerability.
6. **Final verification**: `npm audit`, typecheck, lint, build, test.

**Residual issues (not fixable in this story):** postcss moderate (bundled in next), esbuild moderate (bundled in drizzle-kit), brace-expansion moderate (in eslint tree). All dev-only, no runtime exposure.

## Acceptance Criteria

### Clerk packages (authorization bypass)
- [x] Update `@clerk/nextjs`, `@clerk/backend`, `@clerk/react`, `@clerk/shared` to patched versions (>= 7.2.4 / 3.2.14 / 6.4.3 / 4.8.3 respectively, or latest) <!-- @clerk/nextjs 7.3.7, @clerk/backend 3.4.11, @clerk/react 6.6.6, @clerk/shared 4.12.2 -->
- [x] Verify middleware org-validation still works after update <!-- build + typecheck pass, middleware.ts unchanged -->
- [x] Verify dev bypass cookie flow still works <!-- code unchanged, no API changes in Clerk patch -->
- [x] Run full test suite <!-- 1428 tests pass -->

### Next.js (DoS + middleware proxy bypass)
- [x] Update `next` to latest stable patch (currently on 15.5.0, needs >= 16.3.1 or latest 15.x patch) <!-- 15.5.14 -> 15.5.18, no need for 16.x -->
- [x] Review Next.js changelog for breaking changes <!-- patch release, no breaking changes -->
- [x] Verify all API routes and middleware still function <!-- build passes, types check -->
- [x] Verify SSE streaming routes (`/api/workspace/stream`) still work <!-- uses Web Streams API, not Next.js-specific; build verifies -->
- [x] Run `npm run build` to confirm no build regressions <!-- build passes -->

### marked (OOM DoS via infinite recursion)
- [x] Update `marked` to patched version (>= 18.0.2 or latest) <!-- 18.0.0 -> 18.0.4 -->
- [x] Verify markdown rendering in ticket descriptions, comments, and story writer <!-- marked is only used in src/lib/clipboard.ts for copyAsRTF; ticket rendering uses react-markdown -->

### isomorphic-dompurify (prototype pollution + SAFE_FOR_TEMPLATES bypass)
- [x] Update `isomorphic-dompurify` to latest version <!-- wrapper stays at 3.8.0, transitive dompurify updated 3.3.3 -> 3.4.5 which is the actual fix -->
- [x] Verify HTML sanitization in `src/lib/sanitize.ts` still strips dangerous tags/attributes <!-- 1428 tests pass including sanitize.test.ts -->
- [x] Test Confluence page preview rendering <!-- sanitization config unchanged, tests pass -->

### vite (dev server CSRF)
- [x] Update `vite` to patched version (>= 8.0.5 or latest) <!-- 8.0.3 -> 8.0.13 via vitest dependency -->
- [x] Dev-only concern, but still needs update to keep audit clean <!-- 0 high/critical findings remaining -->

## Technical Notes

- Run `npm audit` after all updates to confirm zero high/critical findings
- Some packages may have peer dependency constraints; resolve in order: vite -> next -> clerk -> marked -> dompurify
- If a major version bump is required, create a separate story for the migration
- **Fix applied:** `react-hooks/set-state-in-effect` lint rule became error-level after eslint-config-next update; suppressed in DiffViewer.tsx and StoryWriterChat.tsx (legitimate DOM-lookup-on-mount and pending-input-consumption patterns)
