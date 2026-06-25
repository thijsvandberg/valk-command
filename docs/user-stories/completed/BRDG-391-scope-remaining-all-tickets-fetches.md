# BRDG-391: Scope the remaining whole-backlog (`useTickets("__all__")`) fetches

**Status:** Closed — not pursued
**Priority:** Medium

## Outcome

**Not pursued.** No code shipped. The BRDG-387 LRU cap already bounds tab memory, so removing the remaining `useTickets("__all__")` calls is a byte/over-fetch optimization, not a fix — and it cannot be done in safe pieces (see the finding below). Closed; can be reopened as a single unit if the over-fetch ever becomes worth it.

## Why it can't be sliced (the finding)

Follow-up to [BRDG-387](docs/user-stories/completed/BRDG-387-frontend-memory-guardrails.md). The "safe parts" (scoping `SessionEndModal` and the in-session ticket page off `__all__`) were implemented and then **backed out**, because the over-fetch removal is gated on the one risky site:

- `useTicketHoverData` ([useTicketHoverData.ts:45](src/hooks/useTicketHoverData.ts#L45)) itself calls `useTickets("__all__")`, and it is mounted on every refinement page the other sites live on (the in-session ticket page and, via `ChildIssueRow`/`SessionQueueItem`, the prep view).
- So while any of those pages is open, `__all__` is fetched regardless. Scoping the other sites to keyed fetches does **not** remove that fetch; it just **adds** redundant per-ticket fetches (each `/api/tickets/{key}` also triggers a Jira sync) on top of it. Net: slower, not faster.

**Conclusion:** `useTicketHoverData` is the linchpin — the common `__all__` consumer. The other sites only pay off once it stops fetching `__all__`, so this must be done as one unit (the hover refactor first, which is the high-risk part: a synchronous-at-render lookup across 5 consumers + `TicketStatusPill`), not in pieces.
