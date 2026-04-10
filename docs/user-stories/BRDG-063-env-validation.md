# BRDG-063: Environment Variable Validation

**Status:** Open
**Priority:** High

## Description

As a developer, I want a `.env.example` file documenting all required variables and a startup validation check that fails fast with clear messages so misconfigurations are caught immediately.

## Acceptance Criteria

### Phase 1: .env.example
- [ ] Create `.env.example` in project root with all required and optional env vars
- [ ] Each variable with a comment explaining its purpose and format
- [ ] Group by integration: Jira, Bitbucket, App settings
- [ ] Include example values (not real credentials)

### Phase 2: Startup validation
- [ ] Zod schema for environment variables in `src/lib/env.ts`
- [ ] Validate on app startup (imported early in the app lifecycle)
- [ ] Required vars: Jira credentials, Bitbucket credentials, app-specific settings
- [ ] Optional vars with defaults: port, log level, cache TTL
- [ ] Clear error messages: "Missing JIRA_BASE_URL. See .env.example for setup."

### Phase 3: Type-safe access
- [ ] Export typed `env` object from `src/lib/env.ts`
- [ ] Replace all `process.env.XXX` usages with `env.XXX`
- [ ] TypeScript types derived from Zod schema (no string | undefined)
- [ ] Runtime validation ensures values match expected format (URL, email, token pattern)

## Technical Notes

- Zod `z.object({}).parse(process.env)` pattern
- Use `z.string().url()` for URLs, `z.string().min(1)` for required strings
- Import env.ts in the root layout or a global initialization module
- Next.js server-only: use `server-only` package to prevent env leaking to client

## Out of Scope (for now)
- Secret rotation reminders
- Env var encryption
- Per-environment configuration files
- Runtime env var reloading
