# Optimistic Updates & the Pending-Edits Overlay

How board edits show up instantly without "snapping back" to stale data. Read this
before adding any new editable field to the board.

## The problem: snap-back

The sprint board renders a list fetched with SWR (`useTickets`). That list is
**refetched constantly**:

- a 60s background poll (`refreshInterval`),
- on window focus / when a picker portal closes (`revalidateOnFocus`),
- after a background Jira sync.

Each refetch **replaces the entire list** with whatever the server returns. When a
user makes a local edit (status, assignee, epic, scores, readiness, ...), the change
is written to the server, but the server often has not caught up at the moment the
next refetch fires:

- **Jira read-after-write lag** - a transition or field change takes a moment to
  propagate through Jira's APIs, so a read right after the write returns the old value.
- **Stale response cache** - the `/api/tickets` route caches responses for ~30s, so a
  refetch can serve a snapshot taken before the write.

The result: the row briefly shows the new value, then a refetch overwrites it with the
old value, and it "snaps back" until the server finally catches up (often a minute
later). This is the single most common class of board bug.

## Why patching the SWR cache once is not enough

The naive fix - `mutate(data, { revalidate: false })`, or SWR's
`optimisticData` / `populateCache` - patches the cache **once**. It survives exactly
one revalidation cycle. The very next independent refetch (poll, focus, sync) replaces
the cache again and the value snaps back. This approach was used per-handler and kept
failing for exactly this reason.

## The fix: a render-time overlay that survives every refetch

Optimistic edits live in a small external store, **not** in the SWR cache. The board
re-applies every live edit on top of the list **on every render**, so no refetch can
win. The value is held until the server data confirms it (self-heal) or a TTL safety
net expires. A snap-back is then structurally impossible regardless of which refetch
fired.

This mirrors the older, proven `pendingSprintMoves.ts` overlay (which solved the same
problem for the single "sprint" field) and generalizes it to all editable fields.

### Pieces

| File | Role |
|------|------|
| `src/components/sprint-board/pendingTicketEdits.ts` | The store: `registerPendingEdit` / `confirmPendingEdit` / `clearPendingEdit`, `applyPendingEdits` (merge), `hasPendingEdit`, TTL self-clear. |
| `src/components/sprint-board/useTicketActions.ts` | Every edit handler registers an edit, calls the API, then confirms on success / clears on failure. |
| `src/components/sprint-board/SprintBoard.tsx` | Applies `applyPendingEdits` to the list (next to `applyPendingMoves`) and runs the self-heal effect. |

### Lifecycle of one edit

1. **Register** - the handler calls `registerPendingEdit(key, field, value, Date.now())`.
   The overlay now applies `value` on top of the list immediately and on every refetch.
2. **Call the API** - the write request runs.
3. **Confirm or clear**:
   - success -> `confirmPendingEdit(key, field)`. The edit stays applied (the server may
     still be lagging) but is now eligible to be cleared once the data matches.
   - failure -> `clearPendingEdit(key, field)`. The row falls back to server data and a
     toast reports the revert.
4. **Self-heal** - a `SprintBoard` effect clears a *confirmed* edit as soon as the server
   list reflects the value (`valuesMatch`). Gating on `confirmed` (not mere presence) is
   essential: clearing earlier would let an in-flight stale refetch win the race.
5. **TTL safety net** - if the server never catches up, `registerPendingEdit` self-clears
   the edit after `TTL_MS` (30s) so it can never stick forever.

### Map-rendered fields (poStatus / readiness)

`poStatus` and `readiness` render from local React maps in `useTicketActions`, not
straight off the list object. They use the same store: their handlers register an edit,
and `syncFromApiTickets` skips reconciling a field while `hasPendingEdit` is true, so a
stale refetch cannot reconcile the map back to the old value.

### Edits made from the ticket-detail sidebar (BRDG-382)

The sidebar (`TicketMetaContent.tsx`) edits several fields that also render on the board
row: epic, assignee, status, story points, business value. When the board is open
beside the sidebar (column layout), those edits must survive the board's refetches too,
so each handler registers on this same overlay (`registerPendingEdit` / `confirmPendingEdit`
/ `clearPendingEdit`), exactly like `useTicketActions`.

The catch: the sidebar's own pickers render from local React state that is re-seeded from
the `ticket` prop whenever it changes (the reset effect in `TicketMetaContent.tsx`), and
that prop comes from the per-key **detail** cache. So the sidebar still patches the detail
cache immediately - but via `patchTicketDetailCache` (`ticket-cache.ts`), which patches
**only** `/api/tickets/<key>`, never the list caches. Patching the list cache here would
be self-defeating: the board's self-heal compares the overlay value against the list data,
so a client-side list patch looks like the server "catching up" and clears the overlay
early, letting the next stale refetch win - the exact snap-back this overlay prevents.

Rule for any sidebar field that also lives on the board row: overlay for the board list,
`patchTicketDetailCache` for the sidebar's own re-seed, never `patchTicketCaches` (which
patches the list). Fields with no board-row presence (PO notes, labels) may keep using
`patchTicketCaches`.

### The save helpers must not patch the list cache for overlay fields (BRDG-383)

`saveTicketMetadata` and `saveStoryPoints` optimistically patch the SWR **list** cache by
default. For a board-row edit that already registers on the overlay, that patch is
self-defeating in exactly the way the sidebar section describes: the client-side list patch
makes the list look like the server caught up, so the self-heal clears the overlay early and
the next stale refetch wins (the value snaps back). The board handlers therefore call the
helpers with `{ patchList: false }`; the overlay is the only display mechanism. The detail-cache
patch stays (the sidebar re-seed). `MultiSprintView` (Compare view) now also rides the overlay
(BRDG-407) and likewise calls these helpers with `{ patchList: false }`.

## Adding a new editable board field (checklist)

1. Add the field name to `EditableField` in `pendingTicketEdits.ts`.
2. In the handler: `registerPendingEdit(key, field, value, Date.now())` before the API
   call; `confirmPendingEdit` on success; `clearPendingEdit` on failure.
3. Do **not** add a bespoke `mutate(..., { revalidate: false })` optimistic patch - the
   overlay already handles display; that pattern is what caused the snap-back bug. If the
   handler saves via `saveTicketMetadata` / `saveStoryPoints`, pass `{ patchList: false }`
   so the helper does not patch the list cache either (BRDG-383).
4. If the field renders from a separate map (like poStatus/readiness) rather than the
   list object, guard its reconciliation with `hasPendingEdit`.
5. Add a test asserting the value survives a stale refetch (see
   `pendingTicketEdits.test.ts` and the handler tests in `useTicketActions.test.ts`).

## Shared row-actions dispatch + per-surface adapters (BRDG-374)

The bulk row actions (status / readiness / epic / move / quick-move / assignee / labels /
flag / review / subtasks / copy / refine) are written **once** in
`src/components/sprint-board/row-actions/useRowActions.ts`. Each surface — Sprint Board,
Epic children, Inbox — supplies a `RowActionsAdapter` (see `row-actions/adapter.ts`) that
reflects the change in **its own** optimism model. The dispatch never forces one model:

| Step | What the dispatch does | What the adapter does per surface |
|------|------------------------|-----------------------------------|
| `beginEdit(keys, field, value)` | before the write | **Board:** `registerPendingEdit` (+ the readiness map the row renders from). **Epic:** `onChildOptimistic` for status/readiness. **Inbox:** nothing (row carries no flag/readiness state). |
| write per key | shared API call (`apiFetch` / `tickets.*` / `jira.*`) | — |
| `confirmEdit(okKeys)` / `revertEdit(failedKeys)` | after settle | **Board:** confirm/clear the overlay (+ restore the readiness map on revert; revalidate for epic/assignee/labels). **Epic/Inbox:** `mutate()` to revalidate. |
| `beginMove` / `confirmMove` / `revertMove` | sprint move | **Board:** `registerPendingMove` then the BRDG-271 destination-cache injection. **Epic/Inbox:** a local `localMoves` name overlay, then `mutate()`; self-heal drops the override when the refetch reflects the move. |

So the board keeps the global `pendingTicketEdits` / `pendingSprintMoves` overlay described
above, while epic and inbox keep their local React-state overlays — all behind one dispatch.
`useTicketActions` is now only the board's **per-row side-panel** handlers (poStatus / story
points / single readiness / `syncFromApiTickets`) plus the readiness map; its old bulk
handlers moved into `useRowActions`. The board's quick-move + create-sprint (it pins +
navigates) and the flag-reason dialog stay in `SprintBoard`; the epic's DnD move/reorder and
create-zone plan-sprint stay in `EpicChildrenSection`.

## Compare view (MultiSprintView) — migrated (BRDG-407)

The two-column Compare view now uses this overlay for its field edits (`title`, `jiraStatus`,
`type`, `storyPoints`, `businessValue`) instead of the old per-handler
`mutate(..., { revalidate:false })` patches, so those edits no longer snap back. It keeps a
self-heal effect (gated on `confirmed`, like the board) that skips tickets currently held by a
move override. Drag moves still use a per-column whole-list override (the view fetches each sprint
separately, so the board's `pendingSprintMoves` does not map cleanly), but the override is now held
for `MOVE_OVERRIDE_TTL_MS` rather than dropped immediately, so a concurrent refetch can't revert a
move before the server-confirmed state propagates. `readiness`/`poStatus` stay as local React maps:
they are never reconciled from a server read in this view, and `poStatus` has no server-persist path,
so the overlay's TTL semantics would be wrong for them.

## History

- `pendingSprintMoves.ts` - original single-field overlay (sprint moves).
- BRDG-357 - generalized the pattern to all editable fields and removed the fragile
  per-handler cache patches.
- BRDG-382 - wired the ticket-detail sidebar edits (epic, assignee, status, points,
  business value) into the overlay and added `patchTicketDetailCache` so the sidebar no
  longer patches the list cache (which defeated the overlay's self-heal).
