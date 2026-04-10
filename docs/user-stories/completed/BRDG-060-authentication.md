# BRDG-060: Authentication Middleware

**Status:** Done
**Priority:** Critical

## Description

As the app owner, I want session-based authentication that protects all routes and API endpoints so the app is not accessible to unauthorized users on the network.

## Acceptance Criteria

### Phase 1: Password-based login
- [x] Login page at `/login` with password field (single-user app, no username needed)
- [x] Password hash stored in `appSetting` table (scrypt)
- [x] Initial setup: if no password is set, show a setup page to create one
- [ ] Password change option in Settings (deferred to follow-up)

### Phase 2: Session management
- [x] On successful login, create a session token (signed JWT)
- [x] Session stored in HTTP-only, secure, SameSite=Strict cookie
- [x] Session expiry: default 7 days
- [x] Session refresh on activity (sliding expiration via middleware)

### Phase 3: Middleware protection
- [x] Next.js middleware at `src/middleware.ts` that checks session cookie
- [x] Protect all routes under `/(app)/*` and `/api/*`
- [x] Exclude: `/login`, `/stakeholder` (has own token auth), static assets, `/_next`
- [x] Redirect unauthenticated requests to `/login`
- [x] API routes return 401 for unauthenticated requests

### Phase 4: Logout
- [x] Logout button in sidebar footer
- [x] Clears session cookie
- [x] Redirects to login page
- [ ] Invalidate session token server-side (stateless JWT, expires naturally)

## Technical Notes

- Single-user app: no user table needed, just a password hash in appSetting
- JWT with `jose` library (Edge-runtime compatible)
- Middleware runs on Edge runtime; JWT_SECRET env var enables middleware-level validation
- Auto-generated JWT secret persisted in appSetting if JWT_SECRET env not set

## Out of Scope (for now)
- OAuth / SSO integration
- Multi-user support
- Two-factor authentication
- API key authentication for external integrations
- Session management UI (list active sessions)
