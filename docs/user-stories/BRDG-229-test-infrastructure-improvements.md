# BRDG-229: Test Infrastructure Improvements

**Status:** In Progress
**Priority:** High
**Type:** Testing / DevEx

## Description

The test suite has solid fundamentals (269 test files, 39k lines, CI on GitHub Actions) but lacks centralized utilities, leading to heavy duplication. 234+ manual `new Request()` constructions, 30+ duplicate seed functions, and only 25% error-path coverage. These improvements are enablers that reduce the effort for BRDG-226, BRDG-227, and BRDG-228.

## Implementation Plan

1. **Part 1: Test Data Builders** - Create `src/test/builders.ts` with build/seed functions for ticket, ticketMetadata, sprintNameCache, conversation, message, epic, scheduledJob, storyWriterSession, refinementSession. Migrate 5 test files.
2. **Part 2: Request Helpers** - Create `src/test/request-helpers.ts` with `buildGet`, `buildJson`, `buildParams`, `parseResponse`. Migrate 5 API test files.
3. **Part 3: Mock Factories** - Create `src/test/mocks/jira-client.ts`, `agent-client.ts`, `bitbucket-client.ts`, `index.ts`. Migrate 3 jira mock files.
4. **Part 4: Error Path Tests** - Add ~30 error-path tests across 10 critical API routes.
5. **Part 5: CI Coverage** - Add `@vitest/coverage-v8`, configure in `vitest.config.ts`, update CI workflow.

**Migration targets (Part 1):** tickets/[key], tickets/[key]/links, notifications, tickets/[key]/story-writer/messages, conversations/[id]/messages
**Migration targets (Part 2):** conversations, refinement-sessions, tickets/[key], notifications, activity-log
**Migration targets (Part 3):** jira/sync-tickets, tickets/[key], tickets/[key]/status

## Acceptance Criteria

- [ ] Test utilities created and usable
- [ ] At least 5 existing test files migrated to use new utilities as proof of concept
- [ ] No existing tests broken
- [ ] `npm run test` and `npm run build` pass

## Findings from Audit

**What is already good (no action needed):**
- All 89 API test files have `// @vitest-environment node` annotation (100%)
- `vitest.setup.ts` properly handles cleanup (rate limiter, DB, React Testing Library)
- `src/db/test-utils.ts` provides `createTestDb()` and `closeAllTestDbs()`
- Consistent mock patterns for `@/db`, `server-only`, `ResizeObserver`
- CI pipeline runs lint, typecheck, test, build in correct order

**What needs improvement:**
- 234+ instances of manual `new Request()` construction
- 30+ duplicate seed/factory functions across test files
- Only `jira-client` has established mock patterns (19 files); `agent-client` and `bitbucket-client` have 0 mock files
- Error test ratio is 25% (165/664 tests) vs. target 35%
- No coverage reporting in CI

---

## Part 1: Centralized Test Data Builders

Database seeding is scattered across individual test files with ad-hoc helpers (`seedTicket`, `insertDeployment`, etc.). This leads to code duplication and inconsistent test data.

### Implementation

- [x] Create `src/test/builders.ts` with builder functions for common entities

Each builder returns a plain object with sensible defaults; a companion `seed*` function inserts it into a test DB.

Builders needed:
- [x] `buildTicket` / `seedTicket`
- [x] `buildTicketMetadata` / `seedTicketMetadata`
- [x] `buildSprint` / `seedSprint` (for sprintNameCache table)
- [x] `buildConversation` / `seedConversation`
- [x] `buildMessage` / `seedMessage`
- [x] `buildEpic` / `seedEpic` (ticket with issueType=Epic)
- [x] `buildScheduledJob` / `seedScheduledJob`
- [x] `buildStoryWriterSession` / `seedStoryWriterSession`
- [x] `buildRefinementSession` / `seedRefinementSession`

### Migration proof of concept

- [x] Migrate 5 existing test files to use the new builders
- [x] Verify tests still pass after migration

---

## Part 2: API Route Test Helpers

API route tests manually construct `new Request()` objects 234+ times with inconsistent patterns.

### Implementation

- [x] Create `src/test/request-helpers.ts`

```typescript
const BASE_URL = "http://localhost:3100";

/** Build a GET request with optional query params */
export function buildGet(path: string, query?: Record<string, string>): Request {
  const url = new URL(path, BASE_URL);
  if (query) Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));
  return new Request(url);
}

/** Build a POST/PUT/PATCH/DELETE request with JSON body */
export function buildJson(method: string, path: string, body?: unknown): Request {
  return new Request(new URL(path, BASE_URL), {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "Content-Type": "application/json" } : undefined,
  });
}

/** Build Next.js dynamic route params */
export function buildParams<T extends Record<string, string>>(params: T): { params: Promise<T> } {
  return { params: Promise.resolve(params) };
}

/** Parse JSON response with status assertion */
export async function parseResponse<T = unknown>(response: Response, expectedStatus = 200): Promise<T> {
  expect(response.status).toBe(expectedStatus);
  return response.json() as Promise<T>;
}
```

### Migration proof of concept

- [x] Migrate 5 existing API test files to use the new helpers
- [x] Verify tests still pass after migration

---

## Part 3: External Client Mock Factories

Only `jira-client` has established mock patterns (19 files). `agent-client` and `bitbucket-client` have 0 files with mocks, yet BRDG-226 routes need them.

### Implementation

- [x] Create `src/test/mocks/jira-client.ts`

Consolidate the common jira-client mock pattern used across 19 files:

```typescript
export function createJiraClientMock(overrides?: Partial<JiraClientMock>) {
  return {
    jiraClient: {
      getIssue: vi.fn().mockResolvedValue({ fields: { updated: new Date().toISOString() } }),
      updateIssue: vi.fn().mockResolvedValue(undefined),
      searchAllIssues: vi.fn().mockResolvedValue([]),
      getComments: vi.fn().mockResolvedValue([]),
      getIssueLinksByKeys: vi.fn().mockResolvedValue([]),
      assignIssue: vi.fn().mockResolvedValue(undefined),
      getLabels: vi.fn().mockResolvedValue([]),
      rankIssues: vi.fn().mockResolvedValue(undefined),
      transitionIssue: vi.fn().mockResolvedValue(undefined),
      createIssue: vi.fn().mockResolvedValue({ key: "VPL-999" }),
      addComment: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    },
    STORY_POINTS_FIELD: "customfield_11909",
    FLAGGED_FIELD: "customfield_10002",
  };
}
```

- [x] Create `src/test/mocks/agent-client.ts`

```typescript
export function createAgentClientMock(overrides?: Partial<AgentClientMock>) {
  return {
    agentFetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "task-1" }))),
    AGENT_PROXY_URL: "http://localhost:4000",
    agentProxyHeaders: vi.fn().mockReturnValue({ "X-Agent": "test" }),
    ...overrides,
  };
}
```

- [x] Create `src/test/mocks/bitbucket-client.ts`

```typescript
export function createBitbucketClientMock(overrides?: Partial<BitbucketClientMock>) {
  return {
    bitbucketClient: {
      getBranches: vi.fn().mockResolvedValue([]),
      getPullRequests: vi.fn().mockResolvedValue([]),
      getPipelines: vi.fn().mockResolvedValue([]),
      getDeployments: vi.fn().mockResolvedValue([]),
      ...overrides,
    },
  };
}
```

- [x] Create `src/test/mocks/index.ts` that re-exports all mock factories

### Migration proof of concept

- [x] Migrate 3 existing jira-client mock files to use the factory
- [x] Verify tests still pass

---

## Part 4: Error Path Coverage Improvement

Current ratio: 25% error tests (165/664). Target: 35%.

### Implementation

- [x] Define a standard error-path checklist for API routes:

```markdown
## Error Test Checklist (per API route)
- [ ] Invalid/missing request body returns 400
- [ ] Non-existent resource returns 404
- [ ] Invalid path params returns 400
- [ ] Rate limit exceeded returns 429 (if rate-limited)
- [ ] External API failure returns 500/502
- [ ] Database error returns 500
```

- [x] Apply the checklist to the 10 most critical existing API route tests, adding missing error tests:
  1. `POST /api/jira/sync-tickets`
  2. `PUT /api/tickets/[key]`
  3. `POST /api/conversations`
  4. `POST /api/workspace-tasks`
  5. `PUT /api/settings/[key]`
  6. `POST /api/refinement-sessions`
  7. `GET /api/search`
  8. `POST /api/notifications`
  9. `POST /api/story-writer/send`
  10. `GET /api/activity-log`

- [x] Add approximately 30 new error-path tests across these 10 files

---

## Part 5: CI Coverage Reporting

No coverage reporting exists. Regressions are invisible.

### Implementation

- [ ] Add `--coverage` flag to vitest in CI
- [ ] Add coverage configuration to `vitest.config.ts`:

```typescript
test: {
  coverage: {
    provider: 'v8',
    reporter: ['text-summary', 'json-summary'],
    // No hard thresholds yet; use as baseline
  }
}
```

- [ ] Add coverage summary output to CI job (just reporting, no threshold enforcement initially)
- [ ] Document current baseline coverage numbers in a comment on the CI workflow

---

## Implementation Order

1. **Part 1 + Part 2** in parallel (test data builders + request helpers)
2. **Part 3** (mock factories, needed by BRDG-226)
3. **Part 4** (error path tests, can be done incrementally alongside BRDG-226)
4. **Part 5** (CI coverage, independent of other parts)

## Notes

- This story is an enabler. Implement before or in parallel with BRDG-226.
- Do NOT add snapshot testing; it creates brittle tests for this type of application.
- Do NOT enforce coverage thresholds yet; first establish a baseline.
- All new files go in `src/test/` directory (new directory, co-located with test infrastructure).
