# BRDG-391: Scope the remaining whole-backlog (`useTickets("__all__")`) fetches

**Status:** To Do
**Priority:** Medium

## Description

Follow-up to [BRDG-387](completed/BRDG-387-frontend-memory-guardrails.md). That story bounded the SWR cache globally and scoped 2 of the 6 `useTickets("__all__")` sites. The remaining 4 pull the entire backlog into the browser and need scoping, but each has a wrinkle that made it more than a drop-in, so they were split out here.

The global LRU cap from BRDG-387 already bounds the memory these cause; this story removes the over-fetch itself (fewer bytes fetched, less revalidation churn).

## Sites to fix

1. **[useTicketHoverData.ts:45](src/hooks/useTicketHoverData.ts#L45)** — highest impact (mounted wherever hover cards appear). Returns a **synchronous** `(key) => hoverData | undefined` lookup backed by the full list, consumed by 6 callers ([tickets/[key]/page.tsx](src/app/(app)/tickets/[key]/page.tsx), the refinement session page, [ChildIssueRow.tsx](src/components/ticket-detail/ChildIssueRow.tsx), [LinkSearchResultRow.tsx](src/components/ticket-detail/LinkSearchResultRow.tsx), [SessionQueueItem.tsx](src/components/refinement-session/SessionQueueItem.tsx)). Converting to lazy per-key resolution (see the existing `useLinkedTicketData` pattern in the same file) changes the API shape across all consumers, so it needs its own design pass.
2. **[SessionEndModal.tsx:48](src/components/refinement-session/SessionEndModal.tsx#L48)** — `allTickets` is keyed by `queue`, but two effects (PO-note seeding ~L126, carry-over seeding ~L224) gate on `!allTickets` (undefined-until-loaded). `useTicketsByKeys` returns `[]` not `undefined`, so a naive swap would seed with empty data and never re-seed. Needs a loaded/`isLoading` signal.
3. **[refinement/[sessionId]/session/[ticketKey]/page.tsx:87](src/app/(app)/refinement/[sessionId]/session/[ticketKey]/page.tsx#L87)** — same undefined-gating in the rehydration effect, and the keys are only known *after* an async `refinementSessionsApi.get`, so `useTicketsByKeys(session.ticketKeys)` cannot be called at first render. Needs a two-phase fetch (store keys in state, fetch reactively) or to read titles from the session record.
4. **[RefinementPageContent.tsx:114](src/components/refinement-session/RefinementPageContent.tsx#L114)** — genuine whole-pool free-text browse/search over all selectable tickets. `useTicketsByKeys` does not fit; needs a **server-side search/filter endpoint** (e.g. `/api/tickets?search=&readiness=&status=` returning a scoped page) plus debounced client wiring and ideally a virtualized result list.

## Implementation Plan (safe slice: sites 2 + 3; sites 1 + 4 deferred)

Opus-planned against the real code. BRDG-387's LRU cap already bounds memory, so this is a perf/over-fetch fix. We land before the not-yet-started BRDG-389 (row adoption), the agreed sequencing.

1. **A1 prerequisite — loading signal.** Add a sibling hook `useTicketsByKeysWithState(keys): { tickets, isLoading }` in [useSprintBoard.ts](src/hooks/useSprintBoard.ts) by extracting the shared SWR fetcher; keep `useTicketsByKeys` returning `Ticket[]` unchanged (3 existing callers + tests stay green). WHY: `useTicketsByKeys` returns `[]` (not `undefined`) before load, which would defeat `!allTickets` gates.
2. **Site 2 — SessionEndModal.** Swap `useTickets("__all__")` (L48) for `useTicketsByKeysWithState(queue)`; replace both `!allTickets` gates (PO-note seeding ~L126, carry-over seeding ~L224) with `isLoading`. WHY: the carry-over seeding effect has a one-time ref guard; firing it against `[]` silently wipes the carry-over selection (a latent data-loss bug). Gate on `isLoading` so it fires only after data arrives.
3. **Site 3 — in-session ticket page.** Two-phase fetch: load the session (keys known only after `refinementSessionsApi.get`), store keys in state, then `useTicketsByKeysWithState(sessionKeys)`. Decouple the rehydration effect from `allTickets`. Session response carries no titles, so non-active queue titles briefly show the key until the keyed fetch resolves (acceptable; active ticket always has full detail).
4. **Tests.** `useSprintBoard.test.ts` (isLoading transition), `SessionEndModal.test.tsx` (mock swap + a regression test proving carry-over seeds only after load), plus a focused site-3 test.

### Deferred (stay open in this story)
- **Site 1 (`useTicketHoverData` lazy refactor):** high-risk, 5 synchronous-at-render consumers + `TicketStatusPill`. Needs its own design pass.
- **Site 4 (`RefinementPageContent` server search):** needs a new `/api/tickets?search=` endpoint; the heaviest piece.

## Acceptance Criteria

- [ ] `useTicketHoverData` no longer calls `useTickets("__all__")`; hover data resolves per-key (board cache first, lazy single-ticket fallback) with no regression to hover cards across its 6 consumers.
- [ ] `SessionEndModal` and the in-session ticket page scope their fetch to the session's keys while preserving the "wait until loaded before seeding" behaviour (a loaded signal replaces the `!allTickets` gate).
- [ ] The Refinement prep queue fetches a server-scoped/searched set instead of the whole backlog.
- [ ] No `useTickets("__all__")` remains in `src/` (a test/lint guard asserts this).

## Testing

- Hover-card resolution returns data for board tickets and lazily for off-board keys; no caller renders an empty card that previously showed data.
- Seeding effects fire once after data loads, not before.
- Refinement search returns scoped results; empty/loading states covered.

## Out of Scope

- The SWR cache cap (done in BRDG-387).
