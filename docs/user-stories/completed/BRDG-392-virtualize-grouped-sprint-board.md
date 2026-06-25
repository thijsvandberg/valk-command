# BRDG-392: Virtualize the grouped Sprint Board

**Status:** Closed — not pursued
**Priority:** Medium

## Outcome

**Not pursued.** No code shipped. The flat Sprint Board already virtualizes above 40 rows; only the **grouped** view (by sprint/epic) still mounts every row. With the BRDG-387 LRU cap bounding memory, this is a DOM/scroll-perf nice-to-have on large grouped boards, and it is high-complexity (see below), so it was not taken on.

## Why it was not taken on

Follow-up to [BRDG-387](docs/user-stories/completed/BRDG-387-frontend-memory-guardrails.md). The grouped path in [TicketTable.tsx](src/components/sprint-board/TicketTable.tsx) (a ~1000-line component) renders per-group `<tbody>` sections, which a single uniform-index virtualizer cannot span. Virtualizing it would need a flattened row model with sticky group headers and a `SortableContext` refactored from per-group to one group-spanning context — with real risk of regressing drag-and-drop, group collapse/pinning, and the optimistic overlay. Reopen as its own focused story if a large grouped board ever needs it.
