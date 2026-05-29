# BRDG-230: Frontend Performance - Reduce Time-to-Interactive

**Status:** In Progress
**Priority:** High
**Type:** Performance

## Description

As a PO opening ticket pages or story writer in a new browser tab, I want the page to become interactive faster, so that I don't have to wait several seconds before I can start working.

## Problem

When opening a URL like `/tickets/VPL-45730` or `/story-writer` in a new tab, the browser must download, parse, and hydrate the entire JS bundle before anything becomes interactive. The bundle is bloated because:

1. The app layout (`src/app/(app)/layout.tsx`) statically imports ~2,800 lines of rarely-visible components (CommandPalette + fuse.js, GlobalSearch + SearchModal, KeyboardShortcutsModal, DeployNotifier, TaskCompletionNotifier) that load on **every page**.
2. Page-level components statically import heavy conditional modals/panels (SearchModal, AddToRefinementModal, TicketPreviewPanel, TicketChatPane, StoryWriterLauncherModal) that are hidden by default.
3. Only 1 of 9+ routes has a `loading.tsx` streaming skeleton. All others show a blank screen while JS loads.
4. `next.config.ts` is missing tree-shaking optimization for several heavy packages.
5. API routes have sequential queries and missing indexes that slow down data delivery.

## Implementation Plan

1. **Commit 1 (Parts 1+4):** Dynamic import layout components + expand optimizePackageImports. Highest impact, lowest risk.
2. **Commit 2 (Part 2):** Dynamic import page-level conditional components in 4 files.
3. **Commit 3 (Part 3):** Create 4 loading.tsx streaming skeletons. Additive only, zero regression risk.
4. **Commit 4 (Parts 5+7):** Backend query optimizations: parallelize epic children + activity log stats.
5. **Commit 5 (Part 6):** Add composite database indexes + run migration.

Order rationale: frontend bundle changes first (highest user-facing impact), then backend optimizations, schema changes last.

## Acceptance Criteria

- [x] Part 1: Dynamic import layout components
- [x] Part 2: Dynamic import page-level conditional components
- [x] Part 3: Add loading.tsx streaming skeletons
- [x] Part 4: Expand optimizePackageImports
- [x] Part 5: Parallelize epic children in ticket detail API
- [x] Part 6: Add missing database indexes
- [x] Part 7: Activity log stats query optimization
- [x] All parts verified: lint, typecheck, test, build pass
- [x] Manual verification: all affected routes load correctly (activity-log page has pre-existing bug unrelated to BRDG-230: `sprints is not iterable` due to API shape mismatch)

---

## Part 1: Dynamic Import Layout Components

**Impact:** Highest. Removes ~200-400KB of deferred JS from every single page load.
**Risk:** Low. Components are invisible until triggered by user action.

### What to change

**`src/app/(app)/layout.tsx`** - Replace 5 static imports with `next/dynamic`:

| Component | Trigger | Currently |
|-----------|---------|-----------|
| `CommandPalette` | Cmd+K | Static (pulls in fuse.js 504KB + 600 lines) |
| `GlobalSearch` | Cmd+Shift+K | Static (pulls in SearchModal 204 lines) |
| `KeyboardShortcutsModal` | ? key | Static |
| `DeployNotifier` | Background event | Static |
| `TaskCompletionNotifier` | Background event | Static |

All five become `dynamic(() => import(...), { ssr: false })`. No loading fallback needed because each component renders nothing until triggered. The JSX in the return stays identical.

**Pattern reference:** Follows the exact pattern already used in `SprintBoard.tsx:13` and `SprintBoardHeader.tsx:16`.

### How to test

- [ ] `npm run build` passes (dynamic imports resolve at build time)
- [ ] `npm run test` passes
- [ ] Manual: Cmd+K opens command palette, Cmd+Shift+K opens global search, ? opens keyboard shortcuts

---

## Part 2: Dynamic Import Page-Level Conditional Components

**Impact:** High. Reduces JS per-page for ticket detail, sprint board, story writer.
**Risk:** Low. All target components are conditionally rendered or initially hidden.

### What to change

**`src/app/(app)/tickets/[key]/page.tsx`** - 4 static imports become dynamic:
- `SearchModal` (line 32) - guarded by `searchOpen` state
- `AddToRefinementModal` (line 31) - guarded by `showAddToRefinement` state
- `TicketPreviewPanel` (line 28) - guarded by `previewTicketKey` state
- `TicketChatPane` (line 29) - guarded by `chatPaneOpen` state

**`src/components/sprint-board/SprintBoard.tsx`** - 2 static imports become dynamic:
- `StoryWriterLauncherModal` (line 14)
- `AddToRefinementModal` (line 15)

**`src/app/(app)/story-writer/page.tsx`** - 1 static import becomes dynamic:
- `StoryWriterLauncherModal` (line 14)

**`src/components/story-writer/StoryWriterLayout.tsx`** - 1 static import becomes dynamic:
- `AddToRefinementModal` (line 27)

All use `dynamic(() => import(...), { ssr: false })` with no loading fallback.

### How to test

- [ ] `npm run build` passes
- [ ] `npm run test` passes
- [ ] Manual ticket detail: chat pane opens, preview panel opens, add-to-refinement modal opens, search opens
- [ ] Manual sprint board: story writer launcher opens, add-to-refinement opens
- [ ] Manual story writer: "New story" modal opens

---

## Part 3: Add `loading.tsx` Streaming Skeletons

**Impact:** High. Eliminates blank white screen on cold tab open for 4 major routes.
**Risk:** None. Pure additive, zero JS shipped.

### What to create

`loading.tsx` is a React Server Component that Next.js streams as raw HTML before any JS loads. Currently only `/tickets/[key]/loading.tsx` exists.

| Route | Skeleton design |
|-------|----------------|
| `src/app/(app)/sprint-board/loading.tsx` | ViewHeader bar + filter bar + 8-row table skeleton |
| `src/app/(app)/story-writer/loading.tsx` | ViewHeader "Story Writer" + 2x2 card grid skeleton |
| `src/app/(app)/chat/loading.tsx` | Left panel (5 conversation rows) + right panel placeholder |
| `src/app/(app)/refinement/loading.tsx` | ViewHeader + empty content area with centered pulse |

Each skeleton matches the real layout of its page so the transition feels seamless. Uses the same CSS classes as the existing `/tickets/[key]/loading.tsx` (`animate-pulse`, `bg-overlay-strong`, `bg-overlay-default`).

### How to test

- [ ] `npm run build` passes
- [ ] Manual: open each route in new tab with "Slow 3G" DevTools throttle. Skeleton should be visible before JS loads.

---

## Part 4: Expand `optimizePackageImports`

**Impact:** Medium. Better tree-shaking for several multi-MB packages.
**Risk:** Low. Build will fail if a package has side effects, which is caught immediately.

### What to change

**`next.config.ts`** - Add to `experimental.optimizePackageImports`:
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` (2.2MB total)
- `prismjs` (3.7MB)
- `react-markdown`
- `marked`

### How to test

- [ ] `npm run build` passes (critical: proves no side-effect issues)
- [ ] `npm run test` passes

---

## Part 5: Parallelize Epic Children in Ticket Detail API

**Impact:** Medium. Removes sequential DB round-trip for epic tickets.
**Risk:** Medium. Requires restructuring query logic.

### What to change

**`src/lib/ticket-detail-builder.ts`** - Currently `buildTicketDetail()` (line 260-285) runs `resolveEpicChildren()` sequentially after `transformQueryData()`. The fix:

1. Make `resolveEpicChildren` receive the epicChildRows data it needs and fold its sub-queries (subtask counts, metadata, sprint names) into a structure that can run in parallel.
2. In `buildTicketDetail`, run `transformQueryData` (sync) and `resolveEpicChildren` (async) concurrently via `Promise.all`.
3. Skip `resolveEpicChildren` entirely when `epicChildRows.length === 0`.

### How to test

- [ ] Existing `src/app/api/tickets/[key]/route.test.ts` passes
- [ ] Manual: open an epic ticket, verify epic children section renders correctly

---

## Part 6: Add Missing Database Indexes

**Impact:** Medium. Faster queries for reviews, versions, chat counts.
**Risk:** Low. Adding indexes is non-destructive.

### What to change

**`src/db/schema.ts`** - Add/replace indexes:

1. Replace separate `stored_review_ticket_key_idx` + `stored_review_created_at_idx` with composite `stored_review_ticket_key_created_at_idx` on `(ticketKey, createdAt)` - used by reviews endpoint ORDER BY
2. Replace `story_version_jira_key_idx` with composite `story_version_jira_key_created_at_idx` on `(jiraKey, createdAt)` - used by latest version lookup
3. Add `conversation_related_ticket_idx` on `conversation(relatedTicket)` - used by chat message count JOIN

After schema changes: run `npx drizzle-kit push` to apply.

### How to test

- [ ] `npx drizzle-kit push` succeeds
- [ ] `npm run test` passes (createTestDb picks up new indexes)
- [ ] `npm run build` passes

---

## Part 7: Activity Log Stats Query Optimization

**Impact:** Lower (only affects /activity-log page with stats, not the main ticket/sprint views).
**Risk:** Low.

### What to change

**`src/app/api/activity-log/route.ts`** (lines 81-93) - Replace 5 parallel full-table-scan queries with a single query fetching all rows from the last 14 days, then partition in JS:

```
Current: 5 separate DB queries each scanning activityLog
After: 1 DB query (WHERE startedAt >= 14daysAgo) + in-memory filtering
```

### How to test

- [ ] Existing `src/app/api/activity-log/route.test.ts` passes
- [ ] Manual: activity log page stats still display correctly

---

## Verification Checklist (After All Parts)

- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes
- [ ] `npm run build` passes
- [ ] Manual: open `/tickets/VPL-45730` in new tab - skeleton visible, page loads, all modals functional
- [ ] Manual: open `/sprint-board` in new tab - skeleton visible, search/modals functional
- [ ] Manual: open `/story-writer` in new tab - skeleton visible, "New story" modal functional
- [ ] Manual: open `/chat` in new tab - skeleton visible, chat loads
- [ ] DevTools Network: initial JS bundle visibly smaller than before

## Files Modified

| File | Parts |
|------|-------|
| `src/app/(app)/layout.tsx` | 1 |
| `src/app/(app)/tickets/[key]/page.tsx` | 2 |
| `src/components/sprint-board/SprintBoard.tsx` | 2 |
| `src/app/(app)/story-writer/page.tsx` | 2 |
| `src/components/story-writer/StoryWriterLayout.tsx` | 2 |
| `src/app/(app)/sprint-board/loading.tsx` | 3 (new) |
| `src/app/(app)/story-writer/loading.tsx` | 3 (new) |
| `src/app/(app)/chat/loading.tsx` | 3 (new) |
| `src/app/(app)/refinement/loading.tsx` | 3 (new) |
| `next.config.ts` | 4 |
| `src/lib/ticket-detail-builder.ts` | 5 |
| `src/db/schema.ts` | 6 |
| `src/app/api/activity-log/route.ts` | 7 |

## Dependencies

None. All parts are independent and can be implemented in any order.
