# Codebase Re-Audit (post sprint-board + row-actions refactor) — 2026-06-25

Second full-codebase audit (`/audit-code`), run after ~190 commits including the full sprint-board /
shared-row-surface refactor and the multiselect + right-click row-actions extraction. Read-only;
no code changed. Six parallel agents covered: refactored board, row-actions module, API routes,
data/sync layer, hooks/contexts/SWR, and lib clients/business-logic. Actionable items are grouped
into stories [[BRDG-405-board-render-performance]] through [[BRDG-410-polling-and-memory-hygiene]].

## Headline

The refactor is solid. The prior audit's fixes (BRDG-375/376/377/379) were verified still in place
with no regressions, the shared `BoardRow` surface is a clean seam (no board concerns leaking into
`ChildIssueRow`), and the recent LRU SWR freeze is genuinely fixed. The findings are concentrated in:
(1) board render performance, (2) an unfinished row-actions extraction (the board still re-implements
the shared glue), (3) a couple of correctness seams (Compare-view snap-back, drag-end index race),
and (4) the usual long-tail of input-validation and polling-hygiene items.

## Two clarifications worth recording

### The 2026-06-24 "app freezes when editing a description" incident — RESOLVED, do not touch
Root cause: the access-order **LRU SWR cache provider** added in BRDG-387 (`swr-lru-provider.ts`).
`keys()` returned a *live* Map iterator while `get()` reorders the same Map (delete + re-insert) to
maintain access order; SWR iterates `keys()` and calls `get()` per entry during a mutate/revalidate
broadcast (which fires exactly when you save an edit), so the moved key was re-visited forever — a
synchronous infinite loop that froze the app. Fixed 2026-06-25 by commit `7b660cd9`: `keys()` now
returns a snapshot iterator (`[...store.keys()][Symbol.iterator]()`). The hooks agent independently
re-verified the provider is now sound. **This fix is correct; leave it as is.**

### The `revalidation-queue` lastChecked finding is NOT a regression
`src/lib/revalidation-queue.ts` has exactly one commit in its history (its creation) and has never
been modified. The `lastChecked` Map was never given a size/age cap — it was *proposed* in the prior
audit but never implemented. It is unrelated to the freeze above. It is a genuine but *slow*
unbounded-Map growth (one entry per ticket key ever checked, pruned only on explicit removal), not a
freeze. The re-audit prompt mislabeled it as a "BRDG-380 fix that regressed"; the accurate status is
"never implemented." When capping it (in BRDG-410), prune by age / snapshot — do NOT iterate-and-
mutate the Map, to avoid repeating the LRU freeze.

## Findings by theme → story

### Board render performance → BRDG-405
| ID | Severity | Location | Issue |
|----|----------|----------|-------|
| RENDER | High (perf) | `src/components/sprint-board/TicketTable.tsx:422-477` | `makeRowProps` builds a fresh per-row prop object from board-wide state (checked/selected/focused/drag/contextMenu), so any single-row change re-renders every visible row; defeats `BoardRow` `memo`. Worse in grouped view (virtualization off). |
| PREFETCH | High (stability) | `src/components/sprint-board/SprintBoard.tsx:88` | `setRouterPrefetch((url) => router.prefetch(url))` runs in render — a render-time side effect into module state the compiler cannot reason about. Move into an effect. |
| DRAGIDX | High (stability) | `src/components/sprint-board/useSprintBoardDragDrop.ts:260-289` | Drag-end derives `oldIndex`/`overIndex`/`placeAbove` from the live filtered `tickets` prop captured at drag start, but mutates the full cache; if the list shifts mid-drag (poll/optimistic edit) the row can land at the wrong rank. Snapshot the list at drag start. |
| OFFSET | Medium | `src/components/sprint-board/TicketTable.tsx:402,416` | Virtualizer reads `tableContainerRef.current?.offsetTop` in render (non-reactive ref-in-render); first paint computes padding from a stale/zero offset → scroll jump when content sits above the table. |
| HEADER | Low | `src/components/sprint-board/SprintBoard.tsx:901-1002` | 100-line `useMemo` returning JSX with ~25 deps; a missed dep silently staleness-bugs the header. Extract to a `<SingleSprintHeader/>` component. |
| TYPES | Low | `pendingTicketEdits.ts:119-126` (`JSON.stringify` equality); `SprintBoard.tsx:296` (double-cast); `:905-906` (`activeSprint!`) | Fragile equality + type escapes around the overlay; minor. |

### Row-actions module convergence → BRDG-406
| ID | Severity | Location | Issue |
|----|----------|----------|-------|
| GLUE | High (structure) | `SprintBoard.tsx:219,678,812-849,1167` vs `row-actions/useRowActions.ts` | The board consumes only `useRowActions`' `bulk*` write primitives and re-implements all the shared glue (`rowMenu` + `handleRowContextMenu`, `computeFlagState`, `quickMovesFor`/`currentSprintIdsFor`/`handleQuickMove`, create-sprint, refine, copy). The "can't drift" guarantee holds only for inbox + epic; the board is a second copy. |
| OPTSDEP | High (perf) | `row-actions/useRowActions.ts:55-62` | `currentSprintName` depends on the whole `opts` literal (new object each render) → recreated every render, breaking memoization of `quickMovesFor`/`currentSprintIdsFor`. Depend on `opts.currentSprintName`. |
| MENUSPLIT | Medium (structure) | `ticket-action-menu.tsx` (840 lines) | Mixes portal positioning (AnchoredMenu/CursorMenu/Flyout) + 5 data-fetching sub-pickers + composition in one file. Split into portals / sub-panels / composer. |
| LABELN+1 | Medium (perf) | `useRowActions.ts:137-148` | Bulk label "add" does one detail GET per selected key (O(N)) and merges labels without trim/case normalization. |
| AVATAR | Medium | `useRowActions.ts:131-135` vs `useTicketActions.ts:155-167` | Bulk assignee write omits the `avatar` the single-row path sends → rows show initials until next revalidation. |
| FLAGSRC | Medium | inbox `page.tsx:160-162` vs `adapter.ts:137` + `inbox-row-actions.test.tsx:73` | Inbox passes `flagSource:"ticket"` (always unflagged) while the adapter doc and the test say `"mixed"`; impl/doc/test disagree. |
| SELPRUNE | Low | `SprintBoard.tsx:167`, inbox `page.tsx:89`, `EpicChildrenSection.tsx:103` | Selection `Set` is never pruned to the visible key set on refresh/filter/move → "N selected" count drift and bulk actions can hit off-screen rows. |
| ORDER | Low | `useRowActions.ts:93-98,115-123` | `runFieldEdit` relies on `Promise.allSettled` index order (correct but undocumented; load-bearing for confirm/revert); `bulkSetReadiness` lacks `try/finally` around in-flight key tracking (stuck spinner if it throws). |

### Compare view (MultiSprintView) → BRDG-407
| ID | Severity | Location | Issue |
|----|----------|----------|-------|
| SNAPBACK | Medium (stability) | `MultiSprintView.tsx:79-89,131-199,227-364` | Title/status/issue-type edits patch the cache once with `revalidate:false` and use plain `useState` maps with no `hasPendingEdit` guard → the exact "edit snaps back after a revalidation" bug the optimistic overlay was built to prevent; a divergent second copy of logic that now lives in `useTicketActions`/`useRowActions`. |

### Finish Jira sync N+1 (close BRDG-378) → BRDG-408
| ID | Severity | Location | Issue |
|----|----------|----------|-------|
| TRANCHE | High (perf) | `sync-tickets-service.ts:89-96` (`syncIndividualTickets`) ← `group-sync.ts:92-97` | The tranche group-sync path (the most-run sync) still does one `getIssue(key)` per key. A 100-ticket sprint = 100 sequential Jira calls. Use `getIssuesByKeys`. This is the one surviving BRDG-378 item. |
| CHUNK | Medium (stability) | `jira-client.ts:930-952` | `getIssuesByKeys` builds one unbounded `key in (...)` JQL; reconcile callers can pass up to 2000 keys → oversized JQL/URL Jira rejects. Chunk internally (slices of ~100). |
| RANKTS | Medium (perf) | `rank/route.ts:44-46` → `sync-jira-timestamp.ts:13-24` | Post-rank loop does one `getIssue` per moved key just to refresh `jiraUpdatedAt`. Bulk it. |
| BURNUP | Low (perf) | `burnup/seed/route.ts:150-152` | Per-ticket changelog fetch in a loop (on-demand seed, bounded concurrency would help). |

### Route input validation hardening → BRDG-409
| ID | Severity | Location | Issue |
|----|----------|----------|-------|
| CONFLPATH | High (security) | `confluence/pages/[pageId]/route.ts:98` + `confluence-client.ts:168,186` | `pageId` validated only by `validatePathParam` (allows `? # ..`) and interpolated unencoded into the upstream Confluence path → query/param injection into a privileged call. Restrict to `^\d+$` and/or `encodeURIComponent`. |
| STREAMID | Medium (security) | `workspace-tasks/[id]/stream/route.ts:14`; `refinement-sessions/[id]/bulk-suggest-subtasks/route.ts:46` | Agent task `id` interpolated unencoded into the agent path; add UUID/`^[A-Za-z0-9_-]+$` guard. |
| JSONCATCH | Medium (stability) | `tickets/[key]/confluence-links/route.ts:42,89`; `pipelines/deploy-settings/route.ts:48` | `request.json()` without try/catch → 500 on malformed body; deploy-settings also persists unvalidated JSON. Use `parseJsonBody` + zod (only these two routes lack the guard). |
| KEYNOTIN | Low (security) | `jira-client.ts:1077,1089,1103,1133` | `key NOT IN (...)` interpolates issue keys unquoted/unvalidated; add `isValidJiraKey` assert (defense in depth). |
| HIDDENIDS / DRAFTKEY | Low | `jira/sprints/route.ts:128`; `story-writer/create-draft/route.ts:31-33` | `hiddenIds` cast not validated; `draftKey` suffix unconstrained. |

### Polling & memory hygiene → BRDG-410
| ID | Severity | Location | Issue |
|----|----------|----------|-------|
| REVALCAP | Medium (stability) | `revalidation-queue.ts:15,51-56` | `lastChecked` Map never capped/pruned → slow unbounded growth (NOT a regression; never implemented). Cap by age — prune by snapshot, never iterate-and-mutate (see LRU note above). |
| STAKEPOLL | Medium (stability) | `useStakeholderAnalysis.ts:140-171` | Recover-effect assigns `pollRef.current = setInterval` with no cleanup; can orphan/double a 4s poll. Clear before assign + cleanup return. |
| LINKSEARCH | Medium (stability) | `useLinkIssueSearch.ts:96-98` | Debounce timers + abort cleared only in `resetSearch`, no unmount effect → setState-after-unmount + dangling fetch on close-while-typing. |
| PIPEPOLL | Medium (perf) | `usePipelines.ts:43-66` | Sets SWR `refreshInterval` AND a manual `setInterval` → double refetch at idle; manual interval ignores tab visibility. |
| HEALTHVIS | Low (perf) | `useWorkspaceHealth.ts:54` | 30s poll ignores tab visibility (siblings guard it). |
| CONVSWR | Low (structure) | `useConversations.ts:47-64`, `useMessages.ts:76-112` | Hand-rolled polling outside SWR → undeduped when both consumers mount, not LRU-bounded. (Larger change; optional within this story.) |
| MISC | Low | `useOutsideClick.ts:25-53`; `useLocalStorage.ts:49-56`; `event-bus.ts:104-110`; `RefinementSessionContext.tsx:69` | Listener/timer churn + a rare BroadcastChannel-without-WebLocks double-dispatch. |

## Verified clean / no action (notable)
- LRU SWR provider freeze: fixed and re-verified (snapshot `keys()`).
- BRDG-375/376/377/379 fixes all intact; no regressions.
- TS-strictness sweep of `src/lib` clean: no real `as any`, no `@ts-ignore`, all `JSON.parse` on stored/external data guarded.
- Shared `BoardRow` surface + row-actions adapter pattern: genuinely good seams (the gap is that the board doesn't use the glue, not that the abstraction is wrong).
- The two `BulkActionBar`s (chat vs sprint-board) are different domains, not duplicates.
- No Jira webhook route exists (sync is poll-driven), so the webhook+edit race class does not apply.
