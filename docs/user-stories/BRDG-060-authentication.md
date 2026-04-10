# BRDG-060: Authentication Middleware

**Status:** Open
**Priority:** Critical

## Description

As the app owner, I want session-based authentication that protects all routes and API endpoints so the app is not accessible to unauthorized users on the network.

## Acceptance Criteria

### Phase 1: Password-based login
- [ ] Login page at `/login` with password field (single-user app, no username needed)
- [ ] Password hash stored in `appSetting` table (bcrypt or argon2)
- [ ] Initial setup: if no password is set, show a setup page to create one
- [ ] Password change option in Settings

### Phase 2: Session management
- [ ] On successful login, create a session token (signed JWT or random UUID)
- [ ] Session stored in HTTP-only, secure, SameSite=Strict cookie
- [ ] Session expiry: configurable, default 7 days
- [ ] Session refresh on activity (sliding expiration)

### Phase 3: Middleware protection
- [ ] Next.js middleware at `src/middleware.ts` that checks session cookie
- [ ] Protect all routes under `/(app)/*` and `/api/*`
- [ ] Exclude: `/login`, `/stakeholder` (has own token auth), static assets, `/_next`
- [ ] Redirect unauthenticated requests to `/login`
- [ ] API routes return 401 for unauthenticated requests

### Phase 4: Logout
- [ ] Logout button in sidebar footer or settings
- [ ] Clears session cookie
- [ ] Redirects to login page
- [ ] Invalidate session token server-side

## Technical Notes

- Single-user app: no user table needed, just a password hash in appSetting
- JWT recommended over UUID for stateless validation (no DB lookup per request)
- Use `jose` or `jsonwebtoken` for JWT signing/verification
- Middleware runs on Edge runtime; keep it lightweight
- Consider `next-auth` if OAuth is needed later, but simple JWT is sufficient for now

## Out of Scope (for now)
- OAuth / SSO integration
- Multi-user support
- Two-factor authentication
- API key authentication for external integrations
- Session management UI (list active sessions)
