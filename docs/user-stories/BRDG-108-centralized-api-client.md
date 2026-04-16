# BRDG-108: Centralized Internal API Client

**Status:** Done
**Priority:** High

## Description

The codebase has 199 `fetch()` calls spread across 65 files. Each call manually builds URLs, checks `res.ok`, parses JSON, and handles errors differently. There is no consistent error handling, no request deduplication, and no retry logic for transient failures. This story introduces a single typed API client that all internal calls go through, replacing the scattered fetch patterns with a uniform layer.

## Implementation Plan

1. **Core `apiFetch` + `ApiError`** - Create `src/lib/api-client.ts` with a throwing `apiFetch<T>()` function and `ApiError` class. Export a shared `swrFetcher` for SWR hooks.
2. **Typed endpoint groups** - Add exported objects per API group (tickets, conversations, settings, etc.) with typed wrappers and URL helpers for SWR keys.
3. **Unit tests** - Create `src/lib/api-client.test.ts` covering core function, error handling, abort signals, and SWR fetcher.
4. **Migrate SWR hooks** (6 files) - Replace per-file `fetcher` definitions with shared `swrFetcher` and URL helpers.
5. **Migrate manual-fetch hooks** (14 files) - Replace direct `fetch()` calls with typed client functions.
6. **Migrate component-level fetches** (~22 files) - Replace inline fetch calls in components and pages.
7. **Verify + cleanup** - Grep for remaining direct fetches, run full test suite, remove dead code.

**SSE/EventSource excluded** - The 4 `EventSource` sites stay as-is; URL helpers may be used for URL construction only.

**SWR integration** - URL helpers + shared fetcher (minimal change), not wrapping SWR inside the client.

## Acceptance Criteria

- [x] Create `src/lib/api-client.ts` with typed wrapper functions per endpoint group (tickets, conversations, settings, etc.)
- [x] All internal API calls go through the client (no direct fetch to `/api/*` in components/hooks)
- [x] Consistent error handling: throw on non-OK, parse error body into typed error
- [x] Abort signal forwarding for cancellable requests
- [x] TypeScript return types matching API response schemas
- [x] Existing tests still pass after migration

## Impact

Reduces boilerplate by roughly 60%, makes error handling consistent across the application, and enables future request caching or optimistic updates without touching every call site.
