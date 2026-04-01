# VC-022: Frontend Quality & Component Health

**Status:** In Progress
**Priority:** Medium
**Estimate:** Large
**Depends on:** VC-018

## Description

The frontend has several structural issues: a 2,162-line page component, memory leaks from uncleaned timers/EventSources, duplicated state initialization patterns, missing error boundaries, and hardcoded colors scattered across components. This story addresses the most impactful frontend quality issues.

## Context

The sprint board and ticket detail views are the most complex parts of the UI. `tickets/[key]/page.tsx` is 2,162 lines with all logic inline. `SprintBoard.tsx` has 6 duplicated localStorage parsing blocks. Several components use `setTimeout` or `EventSource` without cleanup on unmount. No error boundaries exist, so a crash in any child component blanks the entire page.

## Acceptance Criteria

### Phase 1: Memory leak fixes (quick wins)
- [x] `src/components/sprint-board/SprintBoard.tsx:117-121` - Toast timer cleanup. Add a `useEffect` that clears `toastTimerRef.current` on unmount:
  ```tsx
  useEffect(() => {
    return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); };
  }, []);
  ```
- [x] `src/hooks/useWorkspaceTask.ts:95-158` - EventSource cleanup. Ensure `eventSourceRef.current.close()` is called on unmount even if the connection hasn't opened yet. Add a cleanup flag to prevent setState after unmount.
- [x] `src/components/chat/ChatLayout.tsx` - Verify the savedTaskRef pattern doesn't cause stale closures on rapid re-renders

### Phase 2: Error boundaries
- [x] Create a reusable `ErrorBoundary` component in `src/components/shared/ErrorBoundary.tsx`
  - Show a friendly "Something went wrong" message with a retry button
  - Log the error to console with component stack
- [x] Wrap these top-level sections:
  - Sprint board page (`src/app/(app)/sprint-board/page.tsx`)
  - Chat page (`src/app/(app)/chat/page.tsx`)
  - Ticket detail page (`src/app/(app)/tickets/[key]/page.tsx`)
- [x] Write a basic test that verifies the error boundary catches a thrown error

### Phase 3: Extract useLocalStorage hook
- [ ] `src/components/sprint-board/SprintBoard.tsx:84-171` has 6 duplicated patterns:
  ```tsx
  const [value, setValue] = useState<T>(() => {
    try { return JSON.parse(localStorage.getItem(key) ?? ""); }
    catch { return defaultValue; }
  });
  ```
- [ ] Create `src/hooks/useLocalStorage.ts` with proper typing, SSR safety (`typeof window !== 'undefined'`), and sync across tabs via `storage` event
- [ ] Replace all 6 instances in SprintBoard.tsx
- [ ] Write tests for the hook

### Phase 4: Decompose ticket detail page
- [ ] `src/app/(app)/tickets/[key]/page.tsx` is 2,162 lines. Split into:
  - `TicketHeader` - title, status, assignee, breadcrumb
  - `TicketContent` - description with markdown rendering
  - `TicketHistory` - version list and diff viewer
  - `TicketReview` - review dimensions, agent review, score display
  - `TicketRefinement` - estimation, readiness checklist
  - `TicketSidebar` - metadata panel (PO status, quality score, notes)
- [ ] Each component gets its own file in `src/components/ticket-detail/`
- [ ] The page file becomes a thin shell that composes these components
- [ ] Target: page file under 200 lines
- [ ] All existing functionality must be preserved (test by manual verification of all 4 tabs)

### Phase 5: Fix circular useEffect cascade
- [ ] `src/components/sprint-board/SprintBoard.tsx:229-256` has two effects that can trigger each other:
  - Effect 1 (line 234): watches `slotSprints` -> updates `activeSlot`
  - Effect 2 (line 248): watches `activeSlot` -> updates URL
- [ ] Refactor to use URL as single source of truth, with one effect that syncs state from URL on mount/navigation

## Key Files

- `src/app/(app)/tickets/[key]/page.tsx` - 2162 lines, needs decomposition
- `src/components/sprint-board/SprintBoard.tsx` - localStorage duplication, timer leak, effect cascade
- `src/hooks/useWorkspaceTask.ts` - EventSource leak
- `src/components/chat/ChatLayout.tsx` - ref pattern review

## Verification

```bash
npx vitest run          # all tests pass (including new ErrorBoundary + useLocalStorage tests)
npm run build           # clean build
npm run typecheck       # no type errors
# Manual: sprint board - open, switch tabs, close page rapidly (no console errors about unmounted setState)
# Manual: ticket detail - all 4 tabs work exactly as before
# Manual: crash test - temporarily throw in a child component, verify error boundary catches it
```
