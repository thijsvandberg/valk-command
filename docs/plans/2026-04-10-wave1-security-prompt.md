# Wave 1: Security Foundation - Implementation Prompt

Copy the prompt below into a clean Claude Code session.

---

## Prompt

```
Implement the Security Foundation wave for this project (valk-command / Bridge). This covers 5 user stories that harden the app from zero security to production-ready. Read CLAUDE.md and the user stories before starting.

## Stories (implement in this order)

1. **BRDG-063: Environment Variable Validation** - `docs/user-stories/BRDG-063-env-validation.md`
   Start here because the other stories depend on clean env access.
   - Create `.env.example` documenting all vars (see existing `process.env` usages in `src/lib/jira-client.ts`, `src/lib/agent-proxy.ts`, `src/app/api/tickets/[key]/dev-info/route.ts`, `src/db/index.ts`)
   - Create `src/lib/env.ts` with Zod schema validating all env vars at startup
   - Replace all `process.env.XXX` calls across `src/` with typed `env.XXX` imports
   - Use `server-only` package to prevent env leaking to client

2. **BRDG-060: Authentication Middleware** - `docs/user-stories/BRDG-060-authentication.md`
   - Login page at `/login` (password only, single-user app)
   - Password hash in `appSetting` table (key: `auth_password_hash`). Schema already exists in `src/db/schema.ts`
   - First-run setup page when no password is set
   - JWT session in HTTP-only secure cookie, 7-day sliding expiry
   - Next.js middleware at `src/middleware.ts` protecting `/(app)/*` and `/api/*`
   - Exclude: `/login`, `/stakeholder`, `/_next`, static assets
   - Logout button in Sidebar footer
   - Add `jose` package for JWT (Edge-runtime compatible, unlike `jsonwebtoken`)

3. **BRDG-065: Security Headers** - `docs/user-stories/BRDG-065-security-headers.md`
   - Add security headers in `next.config.ts` via the `headers()` function
   - Headers: X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy
   - CSP in report-only mode first. Whitelist: self, unsafe-inline for styles, Atlassian avatar domains for images, data: for inline images
   - Note: there is 1 `dangerouslySetInnerHTML` usage in `src/components/ticket-detail/renderMarkdown.tsx` for Prism.js syntax highlighting - CSP must allow this

4. **BRDG-062: Input Sanitization** - `docs/user-stories/BRDG-062-input-sanitization.md`
   - Add `isomorphic-dompurify` for HTML sanitization
   - Sanitize markdown/HTML content before DB storage in API routes that accept user content (comments, notes, story content, local edits)
   - Add Zod request body validation to all POST/PUT/PATCH API routes (there are 39+ routes under `src/app/api/`)
   - Add length constraints: title 500 chars, description 50000 chars, comment 10000 chars
   - Audit for SQL injection: Drizzle ORM parameterizes by default, verify no raw SQL exists
   - Sanitize attachment filenames and validate MIME types

5. **BRDG-061: Rate Limiting** - `docs/user-stories/BRDG-061-rate-limiting.md`
   - Create `src/lib/rate-limiter.ts` with sliding window algorithm (in-memory Map)
   - Apply as higher-order function wrapping route handlers
   - Limits: sync endpoints 5/min, story writer 10/min, general reads 120/min
   - Return 429 with Retry-After header
   - Add outbound API call tracking for Jira (~100 req/min limit) and Bitbucket (~1000 req/hour)

## Key context

- Stack: Next.js 15 (App Router), TypeScript, Tailwind v4, SQLite + Drizzle ORM
- Single-user app (no user table, no multi-tenancy)
- `appSetting` table already exists for key-value storage
- No `src/middleware.ts` exists yet
- `next.config.ts` is currently empty (just `{}`)
- ~20 `process.env` usages across `src/` to migrate
- Existing env vars: JIRA_CLOUD_ID, JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY, JIRA_BOARD_ID, BITBUCKET_WORKSPACE, BITBUCKET_REPO_SLUG, BITBUCKET_EMAIL, BITBUCKET_APP_PASSWORD/BITBUCKET_API_TOKEN, VALK_AGENT_URL, VALK_AGENT_KEY, NEXT_PUBLIC_JIRA_BASE_URL, NEXT_PUBLIC_APP_URL, BT_NEXT_SPRINT_ID, DB_PATH
- Tests: run `npx vitest run` (foreground, no pipes, one at a time)
- Checks before commit: `npm run lint && npm run typecheck && npm run test && npm run build`

## Rules

- Implement story by story, in order. Mark each checkbox in the story file as done when complete.
- Run tests after each story. Fix any regressions before moving to the next.
- Add tests for new code (auth middleware, rate limiter, env validation, sanitization utils).
- Do not change existing features or UI beyond what's needed for security.
- Use the `implement-story` skill pattern: pick up, implement all phases, test, mark done.
- Commit after each completed story with a conventional commit message.
```
