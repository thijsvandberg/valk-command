# BRDG-063: Environment Variable Validation

**Status:** Open
**Priority:** High

## Description

As a developer, I want a `.env.example` file and startup validation so misconfigurations are caught immediately with clear error messages.

## Core Concepts

- **.env.example**: documented template with all required and optional variables
- **Startup validation**: Zod schema that validates all env vars on app boot
- **Fail fast**: app refuses to start if required vars are missing or malformed
- **Clear errors**: validation errors list exactly which vars are missing/invalid
- **Categories**: group vars by integration (Jira, Bitbucket, Workspace, App)
- **Type coercion**: validate types (URLs must be valid URLs, ports must be numbers)

## Acceptance Criteria

### Phase 1: Create .env.example with all variables documented
- [ ] Create `.env.example` at project root
- [ ] Document all required variables with placeholder values and comments
- [ ] Document all optional variables with their default values
- [ ] Group variables by category (App, Jira, Bitbucket, Workspace, Auth)
- [ ] Include format hints in comments (e.g. "Must be a valid URL", "Numeric Jira field ID")
- [ ] Add `.env.example` to version control (ensure it is not in `.gitignore`)

### Phase 2: Zod validation schema for all env vars
- [ ] Create `src/lib/env.ts` with Zod schema for all environment variables
- [ ] Required variables: `JIRA_BASE_URL`, `JIRA_API_TOKEN`, `JIRA_EMAIL`, `JIRA_CLOUD_ID`, `JIRA_PROJECT_KEY`, `JIRA_BOARD_ID`
- [ ] Required variables: `BITBUCKET_WORKSPACE`, `BITBUCKET_REPO_SLUG`, `BITBUCKET_EMAIL`, `BITBUCKET_API_TOKEN`
- [ ] Required variables: `WORKSPACE_API_URL`
- [ ] Optional variables with defaults: port, session expiry, log level
- [ ] URL validation for all URL-type variables (must be valid URL format)
- [ ] Numeric validation for port numbers and Jira field IDs
- [ ] Non-empty string validation for tokens and credentials

### Phase 3: Startup validation that fails fast with clear error messages
- [ ] Import and execute validation in app startup (instrumentation file or root layout)
- [ ] App refuses to start if any required variable is missing
- [ ] App refuses to start if any variable fails type validation
- [ ] Error output lists all invalid variables at once (not just the first one)
- [ ] Error messages include the variable name, expected format, and received value (masked for secrets)
- [ ] Validation runs in both `dev` and `build` modes

### Phase 4: Type-safe env access throughout the app
- [ ] Export validated and typed `env` object from `src/lib/env.ts`
- [ ] Replace all `process.env.X` access throughout the codebase with `env.X`
- [ ] TypeScript types inferred from Zod schema (no separate type definitions needed)
- [ ] Server-only enforcement: env module should not be importable from client components
- [ ] Add a barrel export that makes importing convenient

### Phase 5: Update CLAUDE.md and docs with env setup instructions
- [ ] Add env setup section to `CLAUDE.md`
- [ ] Document the `cp .env.example .env.local` workflow
- [ ] List which variables need real values vs. which have sensible defaults
- [ ] Update any existing docs that reference environment variables

## Technical Notes

- Create `.env.example` at project root with comments explaining each variable
- Validation module at `src/lib/env.ts` using Zod
- Import and validate in `src/app/layout.tsx` or a custom Next.js instrumentation file
- Current env vars (based on code analysis): `JIRA_BASE_URL`, `JIRA_API_TOKEN`, `JIRA_EMAIL`, `JIRA_CLOUD_ID`, `JIRA_PROJECT_KEY`, `JIRA_BOARD_ID`, various custom field IDs, `BITBUCKET_WORKSPACE`, `BITBUCKET_REPO_SLUG`, `BITBUCKET_EMAIL`, `BITBUCKET_API_TOKEN`, `WORKSPACE_API_URL`
- Optional vars should have documented defaults
- `CLAUDE.md` should reference `.env.example` after this story is complete
- Consider using `@t3-oss/env-nextjs` as an alternative to a custom implementation (evaluate complexity tradeoff)

## Out of Scope (for now)

- Secret rotation
- Encrypted env files
- Vault integration (HashiCorp Vault, AWS Secrets Manager)
- Per-environment configuration files (staging, production)
- Runtime env variable changes without restart
