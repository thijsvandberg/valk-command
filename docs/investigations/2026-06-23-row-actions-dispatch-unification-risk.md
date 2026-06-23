# Row-actions dispatch unification — the real blocker (BRDG-374)

**Date:** 2026-06-23
**Context:** Implementing BRDG-374 (shared, group-based row-actions module). This note records why
the "generalise `useTicketActions` behind one adapter so all three surfaces share it" step is much
larger and riskier than the acceptance criterion implies, and recommends an incremental path.

## Finding: the three surfaces use three *different* optimism models, not one cache shape

The story frames the migration as a data-shape problem (board has `Ticket[]`, inbox has
`NewStoriesResponse`) solvable with a thin `getTicket/patch/mutate` adapter. In reality the surfaces
diverge at a deeper layer — **how they apply optimistic updates** — and that is board-coupled:

- **Board** (`useTicketActions` + `SprintBoard`): every edit goes through the **global
  `pendingTicketEdits` / `pendingSprintMoves` overlay** (`registerPendingEdit` → `saveTicketMetadata`
  with `patchList:false` → `confirmPendingEdit`/`clearPendingEdit`), plus board-local React state
  (`poStatuses`, `readinessMap`) reconciled by `syncFromApiTickets`. The overlay is applied when the
  board builds `displayTickets`, and it self-heals against the board's `Ticket[]` SWR cache.
- **Inbox** (`useInboxRowActions` + `page.tsx`): builds rows via `rowToTicket` + a local `localMoves`
  map; writes are write-through (`tickets.updateMetadata` / `jira.*`) with no overlay. It deliberately
  does **not** call `saveTicketMetadata`/`registerPendingEdit` (doing so would patch the board's caches —
  an explicit BRDG-373 non-goal).
- **Epic** (`EpicChildrenSection`): inline `runBulk` + `onChildOptimistic` callback + local
  `localMoves`/`localMetrics`. Again no global overlay.

Verified: `pendingTicketEdits`/`pendingSprintMoves` are read only by the board path
(`SprintBoard.tsx`, `sprint-board-utils.ts`, `useSprintBoardDragDrop.ts`, `ticket-cache.ts`,
`TicketMetaContent.tsx`). The inbox and epic row builders never apply them.

## Why a thin adapter does not collapse this

`useTicketActions` calls `registerPendingEdit(...)` / `saveTicketMetadata(...)` **directly** in ~20
handlers. To make the same hook serve the inbox/epic you must either:

1. Route every `registerPendingEdit`/`confirm`/`clear` through the adapter, and have the inbox/epic
   adapters implement an overlay-equivalent confirm/revert protocol over their local state — a rewrite
   of all handlers plus new optimism plumbing on two surfaces; or
2. Make the inbox/epic adopt the global overlay (apply `pendingTicketEdits` in their row builders) —
   a real behavioral change to two surfaces whose self-heal/TTL was tuned against the board cache.

Both are substantial and touch the app's most heavily-tested, highest-traffic components
(`SprintBoard`, `EpicChildrenSection`, `/inbox`). The regression surface is the entire
board/epic/inbox optimistic-update behavior (BRDG-271 dest-cache injection, BRDG-357 self-heal,
BRDG-370 placement). This is not safe to land in a single autonomous pass without staged review.

## What shipped in pass 1 (safe, tested, committed)

- **Group registry** `src/components/sprint-board/row-actions/groups.ts` (+ tests) — the declarative
  group model + per-surface composition (groups + `rank`/`metrics` capabilities). No wiring yet.
- **Quick-move labels** — `quick-moves.ts` now emits purpose-led labels ("Move to active/next/backlog")
  plus a `target` field (destination sprint name), rendered as a chip in the shared menu/bar. Live on
  all three surfaces; tests updated. This is the one user-visible piece that was safe to land standalone.
- The design spec + Opus implementation plan are in the story; the validated prototype is at
  `/dev/exploration/row-actions`.

## Recommended incremental path (each a reviewable PR, tree green throughout)

1. **Adapter seam, board-only consumer.** Refactor `useTicketActions` to read `getTicket`/list/`mutate`
   and the dest-cache injection via a `makeBoardAdapter`, preserving board behavior byte-for-byte
   (guard with `SprintBoard.moveMeter.test.tsx`). No new consumer yet. Land + verify in isolation.
2. **`useRowActions` + presentation wrappers as pass-throughs** over the existing
   `TicketActionMenuContent`/`BulkActionBar` (behaviour identical; existing tests stay green). Establish
   the registry-driven structure without changing the dispatch or the look.
3. **Presentation UX-fold**, one change at a time, with the bar/menu tests rewritten per change: Move
   named labels + "More sprints ▸" (generic buckets), Update/Assist nesting, "Add to refinement ▸"
   session list, icon-only bar + caret cue, SP/BV optional. Each is a contained, visually-verifiable PR.
4. **Migrate inbox**, then **epic**, each onto `useRowActions` with its own adapter — choosing ONE
   optimism model deliberately (recommend: keep each surface's existing local optimism, expose it via
   the adapter's `patch`/`mutate`, rather than forcing the global overlay onto inbox/epic). Re-home the
   `useInboxRowActions`/epic tests. Verify optimistic revert on each surface.
5. **Collapse** `useInboxRowActions` and the epic inline dispatch once both consume the module.

The decision in step 4 (which optimism model wins) is the crux and should be made explicitly, not
implicitly via an adapter that hides it.
