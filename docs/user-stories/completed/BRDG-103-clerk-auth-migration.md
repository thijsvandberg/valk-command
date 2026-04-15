# BRDG-103: Migrate Authentication to Clerk

**Status:** Completed
**Priority:** Medium

## Description

Bridge currently uses a custom authentication system: a self-managed password stored as a scrypt hash in SQLite (`appSetting` table), JWT tokens signed with an auto-generated or env-provided secret, and a hand-rolled middleware for session validation with sliding cookie expiry.

This works but is a maintenance burden and lacks features that Clerk provides out of the box (social login, session management UI, device tracking, MFA). Other Valk Platform projects (Clima, Pronto) already use Clerk, so migrating Bridge brings consistency across the platform.

## Current State

Files involved in the custom auth system:

- `src/middleware.ts` - Edge middleware: checks `bridge_session` cookie, JWT verification, sliding expiry, redirects to `/login`
- `src/lib/auth.ts` - JWT creation/verification (jose), password hashing (scrypt), cookie helpers, auto-generated secret persistence in SQLite
- `src/app/api/auth/login/route.ts` - Password login endpoint
- `src/app/api/auth/setup/route.ts` - First-run password creation
- `src/app/api/auth/logout/route.ts` - Session teardown
- `src/app/login/page.tsx` - Custom login page with setup/login dual mode

Dependencies: `jose` (JWT), Node `crypto` (scrypt hashing)

## Target State

Use `@clerk/nextjs` (same as Clima) for all authentication. Clerk handles:

- Login/signup UI (hosted or embedded components)
- Session management (middleware + server-side helpers)
- Token verification
- Cookie management

### Reference implementation

Clima (`/Users/thijsvandenberg/Projects/clima`) uses `@clerk/nextjs` with:
- `clerkMiddleware` + `createRouteMatcher` for route protection
- `BYPASS_AUTH` env var for local dev convenience
- Public routes: `/login`, `/sign-in`, `/sign-up`

## Implementation Plan

1. **Install `@clerk/nextjs`, uninstall `jose`** — `package.json`
2. **Add `ClerkProvider` to root layout** — `src/app/layout.tsx`
3. **Replace middleware** — rewrite `src/middleware.ts` with `clerkMiddleware` + `createRouteMatcher`; API routes return 401 for unauthenticated requests; org check via `CLERK_ORG_ID`; `BYPASS_AUTH` dev escape hatch; matcher excludes static assets and `manifest.webmanifest`
4. **Replace login page** — rewrite `src/app/login/page.tsx` with embedded Clerk `<SignIn />` + dark appearance to match existing theme
5. **Move old auth files to `deleted/`** — `src/lib/auth.ts`, `src/lib/auth.test.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/auth/setup/route.ts`, `src/app/api/auth/logout/route.ts`
6. **Clean up `env.ts`** — remove `JWT_SECRET` from Zod schema; add `CLERK_ORG_ID`
7. **Drizzle migration 0039** — data-only `DELETE FROM app_setting WHERE key IN ('auth_password_hash', 'jwt_secret')`
8. **Update `.env.example`** — replace auth section with Clerk vars
9. **Update `routes.test.tsx`** — remove the three `auth` API route entries
10. **Update `docs/architecture/api-routes.md`** — add authentication section describing Clerk setup
11. **Run full test suite** — `npm run lint && npm run typecheck && npm run test && npm run build`

**Dependency note:** Steps 2-6 form one atomic commit since removing `jose` and the old auth files must happen together to avoid broken imports.

**Org check:** Middleware reads `CLERK_ORG_ID` from env; after `auth.protect()` confirms the user is authenticated, `await auth()` is called to get `orgId`. If `orgId` does not match `CLERK_ORG_ID`, API routes receive a 403 and page routes are redirected to `/login`. This requires the user to have the Bridge Clerk org set as their active organization.

## Acceptance Criteria

- [x] Install `@clerk/nextjs` and configure Clerk env vars (`CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`)
- [x] Replace `src/middleware.ts` with Clerk middleware (`clerkMiddleware` + `createRouteMatcher`)
- [x] Keep API routes (`/api/*`) protected; return 401 for unauthenticated API requests
- [x] Stakeholder view (`/stakeholder`) stays behind auth (no public exception)
- [x] Replace custom login page with embedded Clerk `<SignIn />` component
- [x] Remove custom auth files: `src/lib/auth.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/auth/setup/route.ts`, `src/app/api/auth/logout/route.ts`, `src/app/login/page.tsx`
- [x] Remove `jose` dependency (only used for custom JWT; not needed with Clerk)
- [x] Remove `auth_password_hash` and `jwt_secret` from `appSetting` table (migration or manual cleanup)
- [x] Add `BYPASS_AUTH` env var option for local development (matching Clima pattern)
- [x] Update `.env.example` with Clerk env vars
- [x] All existing tests pass or are updated for new auth approach
- [x] Update `docs/architecture/api-routes.md` auth section

## Notes

- Single-user app, so Clerk is a bit heavyweight, but consistency with Clima/Pronto outweighs that
- All sync and cron endpoints are frontend-driven (lazy-cron pattern). No external webhook receivers exist, so no routes need special public access. Only `/sign-in` and `/sign-up` are public.
- `src/lib/auth.test.ts` can be removed along with the custom auth code
- The `appSetting` rows for `jwt_secret` and `auth_password_hash` can be cleaned up via a Drizzle migration or left as orphaned data
