# Pre-existing test failures on `dev` (observed during BRDG-354)

**Date:** 2026-06-16
**Context:** `npm run verify` during the BRDG-354 implementation surfaced 4 failing tests across 2 files. None are caused by BRDG-354 (which touched only `src/lib/create-ticket.ts`, the epic-children route, and the Story Writer create route) or by the uncommitted BRDG-353 fix (which changed only `pushToJira` service internals). Recording here so they are not lost; they belong to other (likely in-progress, parallel) work and were left untouched per scope/hygiene rules.

## 1. `src/app/api/tickets/[key]/push-to-jira/route.test.ts` — 3 failures

Failing cases: "returns result from ticketService.pushToJira", "ignores a legacy force flag in the request body", "resolves DRAFT key before calling pushToJira".

Cause: the route now calls `ticketService.pushToJira(key, originFromRequest(request), actingUser)` (3 args — the `actingUser` from `getActingUser()` was added), but the test still asserts a 2-arg call:

```
expected pushToJira called with [ 'VPL-100', null ]
received                        [ 'VPL-100', null, null ]
```

Fix (out of scope here): update the test's `toHaveBeenCalledWith(...)` assertions to include the third `actingUser` argument (and mock `getActingUser` if needed). This is a stale-test update, not a code bug.

## 2. `src/components/chat/ChatLayout.test.tsx` — 1 failure

Failing case: "shows empty state when no conversations exist".

Cause: `TypeError: Cannot read properties of null (reading 'map')` originating in `useConversationFilters` (`src/hooks/useConversationFilters.ts:54`) via `ChatLayout` — conversations is `null` in that test path and is mapped without a guard. The empty-state text "No conversations yet" therefore never renders.

Fix (out of scope here): guard the `.map` against `null`/`undefined` in `useConversationFilters`, or have the test provide an empty array instead of null.

## Note

The working tree carried unrelated parallel-session changes at the start of this run (e.g. `NavPanel`, `sprint-cache`, `schema.ts`). These failures may be tied to that in-progress work; they reproduce in the committed state regardless and are not introduced by BRDG-354.
