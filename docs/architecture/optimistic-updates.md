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

## Adding a new editable board field (checklist)

1. Add the field name to `EditableField` in `pendingTicketEdits.ts`.
2. In the handler: `registerPendingEdit(key, field, value, Date.now())` before the API
   call; `confirmPendingEdit` on success; `clearPendingEdit` on failure.
3. Do **not** add a bespoke `mutate(..., { revalidate: false })` optimistic patch - the
   overlay already handles display; that pattern is what caused the snap-back bug.
4. If the field renders from a separate map (like poStatus/readiness) rather than the
   list object, guard its reconciliation with `hasPendingEdit`.
5. Add a test asserting the value survives a stale refetch (see
   `pendingTicketEdits.test.ts` and the handler tests in `useTicketActions.test.ts`).

## Known follow-up

`MultiSprintView.tsx` has its own duplicated optimistic maps and does not yet use this
overlay; it should be migrated so the multi-column view gets the same guarantee.

## History

- `pendingSprintMoves.ts` - original single-field overlay (sprint moves).
- BRDG-357 - generalized the pattern to all editable fields and removed the fragile
  per-handler cache patches.
