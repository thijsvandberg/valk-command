# BRDG-231: Fix Dependency Vulnerabilities

**Status:** Not Started
**Priority:** High
**Type:** Security

## Description

`npm audit` reports 8 vulnerabilities (2 high, 6 moderate). The high-severity issues are in transitive dependencies of core packages (Clerk, drizzle-kit, Next.js). Updating these parent packages to their latest versions should resolve the CVEs.

## Findings

### High Severity

1. **js-cookie <=3.0.5** (cookie attribute injection)
   - Chain: `@clerk/shared` -> `js-cookie`
   - Fix: update `@clerk/nextjs` to latest

2. **esbuild <=0.24.2**
   - Chain: `drizzle-kit` -> `@esbuild-kit/esm-loader` -> `esbuild`
   - Fix: update `drizzle-kit` to latest

### Moderate Severity

3. **postcss <8.5.10** (XSS via unescaped `</style>`)
   - Chain: `next` -> `postcss`
   - Fix: update `next` to latest stable

4-8. Additional moderate issues in transitive deps (resolved by updating parent packages)

## Acceptance Criteria

- [ ] Update `@clerk/nextjs` to latest stable
- [ ] Update `drizzle-kit` to latest stable
- [ ] Update `next` to latest stable 15.x
- [ ] Run `npm audit` and confirm 0 high/critical vulnerabilities remain
- [ ] `npm run build` passes
- [ ] `npm run test` passes
- [ ] Verify Clerk auth still works (login, middleware protection)
- [ ] Verify Drizzle migrations still work (`npx drizzle-kit generate` produces no diff)
