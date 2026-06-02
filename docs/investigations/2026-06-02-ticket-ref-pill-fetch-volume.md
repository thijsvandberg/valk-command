# Ticket-ref pill fetch volume (BRDG-248)

**Date:** 2026-06-02
**Context:** BRDG-248 enabled `TicketRefPill` linkification in chat and comments. The story flagged a fetch-volume concern: each pill lazily fetches `GET /api/tickets/[key]` plus `useJiraSprints` for the hover-card sprint name, and chat/comments can contain many refs.

## Assessment

No code was added. The existing mitigations are judged sufficient for chat/comment volume:

- `TicketRefPill` (`src/components/shared/TicketRefPill.tsx`) SWR-dedupes per key (`dedupingInterval: 30_000`, `revalidateOnFocus: false`, `shouldRetryOnError: false`), so repeated references to the same key collapse to a single request.
- The `/api/tickets/[key]` endpoint is server-side cached.
- The fetch is deferred to a post-mount effect, so it never blocks first paint.
- `useJiraSprints` is SWR-shared across all pills (one request, not per-pill).

The realistic worst case is a thread with many *distinct* keys, where each distinct key costs one cached request — the same behaviour already shipped for ticket descriptions in BRDG-247.

## Recommendation

Revisit only if real chat/comment usage shows N+1 fetch pressure (e.g. a long thread referencing dozens of distinct tickets degrading perceived responsiveness). If so, evaluate a shared/batched lookup (a `/api/tickets?keys=` batch endpoint, or reusing the SWR-cached `/api/tickets` list via a `useTicketHoverData`-style shared store) rather than one request per pill. This is speculative and intentionally not built now.
