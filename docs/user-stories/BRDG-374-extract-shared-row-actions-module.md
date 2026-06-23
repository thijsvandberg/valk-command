# BRDG-374: Shared, group-based row-actions module (menu + bulk bar + dispatch)

**Status:** In progress — the grouped UI (A) is shipped + verified on the real board (pass 2, 2026-06-23); the shared-dispatch dedup (B) is the remaining internal refactor (see Progress)
**Priority:** Medium
**Type:** Refactor + UX — Sprint board / shared components

## Progress (pass 2 — 2026-06-23): grouped UI shipped

The full visible redesign (A) now ships in the **shared** components, so all three surfaces
(board, epic children, inbox) get it at once — verified on the real board via headless screenshots:
- **Right-click menu** restructured: Move top-level/inline with named quick-moves + destination chips
  + **More sprints ▸**; **Update ▸** (file-pen) and **Assist ▸** (sparkles) nested; Flag inline;
  **Add to refinement**. Driven by a view stack so the same content composes in both presentations.
- **Multi-select bar** rebuilt icon-only: Update / Move / Flag / Assist as icon+caret dropdowns
  (content reused from the menu via `initialView`), then a divider, then Refinement / Copy / Refresh
  icons; **Mark-as-read** stays the labelled primary; SP/BV counters optional (off on inbox).
- Prop interfaces unchanged, so no caller edits were needed. Full suite (6418 tests) + `npm run build`
  green. Commits: group registry, quick-move labels, grouped menu+bar, test updates.

**Still remaining — B (shared dispatch):** collapse the three dispatch layers (`useTicketActions`,
the epic inline `runBulk`, `useInboxRowActions`) behind one `useRowActions` + adapter. This is the
internal dedup; it does not change behaviour or the UI. It carries the optimism-model risk documented
below and is best done as its own reviewed increment.

## Progress (implementation pass 1 — 2026-06-23)

**Landed (committed, tested, green):**
- Group registry `src/components/sprint-board/row-actions/groups.ts` + `groups.test.ts` — the
  declarative group model + per-surface composition (groups + `rank`/`metrics` capabilities).
- Quick-move labels switched to purpose-led ("Move to active/next/backlog") with a `target` chip
  (destination sprint name), rendered in the shared menu/bar. Live on all three surfaces;
  `quick-moves.test.ts` + `ticket-action-menu.test.tsx` updated.

**Paused — needs staged, reviewed work (NOT safe to rush in one pass):** generalising
`useTicketActions` onto a shared adapter and migrating the inbox/epic dispatch onto it. Investigation
found the three surfaces use **three different optimism models** (board: global `pendingTicketEdits`/
`pendingSprintMoves` overlay + `saveTicketMetadata`; inbox/epic: local React maps / `onChildOptimistic`,
deliberately NOT the overlay). Unifying them is a real behavioral change to the app's most
heavily-tested components, not the thin adapter swap the AC implies. See
[../investigations/2026-06-23-row-actions-dispatch-unification-risk.md](../investigations/2026-06-23-row-actions-dispatch-unification-risk.md)
for the finding + recommended incremental path (adapter seam → wrappers as pass-throughs → presentation
UX-fold per change → migrate inbox then epic, choosing ONE optimism model explicitly).

## Goal

The ticket row-actions surface (right-click menu + multi-select bulk bar + their dispatch
handlers) is **partly shared and partly copy-pasted**, and the two presentations have **drifted**
(e.g. Review Story is a top-level menu item but lives under an "AI Assist" dropdown in the bar).
The presentation components are reused, but each surface re-derives ~20 props and ships its own
dispatch layer, so adding an action means editing several places and the menu/bar fall out of sync.

Replace the loose prop-by-prop wiring with a **group-based module**: actions live in a small set of
cohesive **groups**; a surface declares which groups (and capabilities) it wants; **both** the
right-click menu and the bulk bar render from the **same group definitions**. Net result: one source
of truth, the menu and bar cannot drift, and a new action added to a group appears everywhere that
group is enabled.

The design below was explored and validated interactively at
**`/dev/exploration/row-actions`** (surface presets, live group toggles, both presentations, an
interactive right-click + selection demo, and a group x surface matrix). Keep that page as the living
reference until the real module lands.

## The group model

Actions are organised into groups. Each group has an id, a label, an icon, an ordered set of actions,
and flags for how it renders. A surface enables a subset of groups plus a few capabilities.

| Group | Icon | Actions | In menu | In bar |
|-------|------|---------|---------|--------|
| **Triage** | mail-open | Mark as read | leading item (check icon) | **labelled primary** ("Mark N as read") |
| **Move** | swap (arrow-right-left) | Move to active, Move to next, Move to backlog, **More sprints ▸**, Move to top, Move to bottom | top-level / inline (most used) | dropdown |
| **Update** | file-pen | Status, Readiness, Epic, Assignee, Label | nested ("Update ▸") | dropdown |
| **Flag** | flag | Flag, Remove flag | inline | dropdown |
| **Assist** | sparkles | Review story, Generate subtasks, Export summary | nested ("Assist ▸") | dropdown |
| **Refinement** | boxes | **Add to refinement ▸** → scheduled sessions + "New refinement…" | nested | dropdown |
| **Copy** | copy | Copy list | — (bar only) | plain icon |
| **Refresh** | refresh-cw | Refresh from Jira | — (bar only) | plain icon |
| **Bookmark** | bookmark | Bookmark | reserved (future) | reserved (future) |

### Presentation 1 — right-click menu

- Order: **Triage → Move → Update → Flag → Assist → Refinement**. Dividers only between
  clusters that are actually present.
- **Move is top-level and inline** (it is the most-used action). The named quick-moves
  (active/next/backlog) render directly with the **destination sprint name as a trailing chip**.
  The remaining pinned sprints + generic buckets + custom pick sit behind **More sprints ▸**.
  Rank items (Move to top/bottom) only render when the surface has a manual order.
- **Update** and **Assist** each collapse to a single parent item that opens a sub-menu
  ("Update ▸", "Assist ▸") — one level deeper, keeps the top of the menu short.
- **Refinement** is "Add to refinement ▸" → the list of scheduled refinements + "New refinement…".
- **Copy and Refresh are bar-only** (list-level ops; they don't belong on a single right-clicked row).

### Presentation 2 — multi-select bar

- **Icon-only for compactness.** A group with one action is a plain icon button; a group with
  more than one action opens a **dropdown**, signalled by a **caret** beside the icon (the chosen
  cue — see "Dropdown cue" below).
- **Triage stays a labelled primary** button ("Mark N as read") — it is the headline inbox action;
  not collapsed to an icon.
- Left side: **select-all checkbox**, an "N/total selected" counter, and **optional SP / BV counters**.
- Two clusters separated by a divider: edit/act (**Update, Move, Flag, Assist**) then list-ops
  (**Refinement, Copy, Refresh**), then **Clear**.
- The bar hugs its content (its background always fits exactly; no overflow past the rounded edge).

### Per-surface composition

| Group / capability | Sprint Board | Epic children | Inbox |
|--------------------|:------------:|:-------------:|:-----:|
| Triage (Mark as read) | – | – | ✓ (labelled primary) |
| Move | ✓ | ✓ | ✓ |
| Update | ✓ | ✓ | ✓ |
| Flag | ✓ | ✓ | ✓ (write-through*) |
| Assist | ✓ | ✓ | ✓ |
| Refinement | ✓ | ✓ | ✓ |
| Copy | ✓ | ✓ | ✓ |
| Refresh | ✓ | – | – |
| Bookmark | reserved | reserved | reserved |
| **Capability: rank** (Move to top/bottom) | ✓ | – | – |
| **Capability: SP / BV counters** | ✓ | ✓ | **off** |

\* Inbox `NewStoryRow` carries no `flagged`/`readiness`/`businessValue`, so Flag/Readiness are
write-through (they fire but don't reflect current state). Enriching the row model is a follow-up
(noted in BRDG-373).

### Dropdown cue (bar)

Chosen: **Caret** — a legible chevron beside the icon on dropdown groups (the icon button becomes a
small pill). Single-action groups (Copy, Refresh) stay square icons, so "opens a menu" vs "fires now"
is visible at a glance. Rejected alternatives explored in the sandbox: None (no affordance),
Underline (too subtle), Recessed (faint tint — clean but less explicit). The sandbox keeps all four
toggleable for reference.

## Naming & labels (decisions)

- **"Update"** is the group name for the field-setters (Status / Readiness / Epic / Assignee / Label).
  Chosen over Set / Edit / Fields / Properties. Icon: **file-pen**.
- **"Assist"** is the group name for the AI helpers (was "AI Assist"). Icon: sparkles.
- **Move** icon: **swap (arrow-right-left)**. Rank items use **arrow-up-to-line / arrow-down-to-line**.
- **Quick-move labels:** purpose-led label + destination sprint chip —
  **"Move to active" · `BT: 140`**, **"Move to next" · `BT: 142`**, **"Move to backlog" · `BT: Backlog`**
  (order: active, then next, then backlog). This replaces the current
  [`computeQuickMoves`](../../src/lib/quick-moves.ts) label format `Move to "BT: 140"` + an `active`
  badge. **Use "active" (not "current")** — it matches the Jira sprint `state === "active"` and the
  existing `badge: "active"`, so code and UI agree.
- **More sprints ▸** contains: remaining pinned sprints, the generic buckets **Overall refinement**
  and **Backlog**, then **Choose sprint…** (custom pick).
- **Refinement:** the entry is **"Add to refinement"** opening the list of scheduled refinement
  sessions + **"New refinement…"** (no separate "add to next refinement" quick item).

## Architecture (the refactor underneath)

The group model needs one shared dispatch path so an action is written once. Today there are three:
[`useTicketActions`](../../src/components/sprint-board/useTicketActions.ts) (board, bound to
`Ticket[]` + `KeyedMutator<Ticket[]>`), an inline `runBulk` in
[`EpicChildrenSection`](../../src/components/ticket-detail/EpicChildrenSection.tsx), and
[`useInboxRowActions`](../../src/app/(app)/inbox/useInboxRowActions.ts) (mirrors the epic pattern for
`NewStoriesResponse`). BRDG-373 shipped the inbox with this local adapter on the understanding that
374 collapses it.

1. **Group registry** — declarative definition of the groups + actions above, surface-agnostic. Both
   presentations and the dispatch read from it.
2. **`useRowActions(...)` composition hook** — wraps the dispatch and owns the glue currently inline
   in `SprintBoard`/`EpicChildrenSection`/inbox: `rowMenu` state + `handleRowContextMenu`,
   `quickMovesFor` + `handleQuickMove` + create-sprint signalling, flag-state, and the
   review/subtasks/refine orchestration. Returns ready-made props for the menu and bar plus the modal
   signals the host renders.
3. **Generalise the data contract.** Replace the hard `Ticket[]` / `KeyedMutator<Ticket[]>` dependency
   with a thin adapter: `getTicket(key) → Ticket`, `patch(key, partial)` (optimistic), `mutate()`
   (revalidate). Board passes its `Ticket[]` cache; inbox passes a `NewStoryRow`-backed adapter; epic
   passes its callback-backed adapter. Optimistic mechanics (`pendingTicketEdits`/`pendingSprintMoves`)
   stay intact — see [optimistic-updates.md](../architecture/optimistic-updates.md).
4. **Thin wrapper components** — `<RowContextMenu surface={...} />` and `<RowBulkBar surface={...} />`
   render the menu/bar from the group registry + a surface descriptor (enabled groups + capabilities:
   `rank`, `metrics`, triage), so a host mounts two components instead of re-deriving ~20 props. The
   host still owns row rendering (`BoardRow`), selection state, and modal mounting.
5. **Migrate all three surfaces** onto the module: `SprintBoard`, `EpicChildrenSection`, inbox —
   collapsing `useInboxRowActions` and the epic inline `runBulk` into the shared path, **no
   behavioural change** beyond the agreed UX (menu/bar parity, named moves, refinement list, caret).

## Scope

**In:** Sprint Board, Epic children, Inbox.

**Out (confirmed):**
- **MultiSprintView** — EOL; moving to other tables.
- **`/cleanup`** — its own bespoke bar with cleanup-specific actions (disposition, enqueue).
- **Chat / ConversationList** — a *different domain* (conversations) with its own
  [chat/BulkActionBar](../../src/components/chat/BulkActionBar.tsx); same UX shape, non-overlapping
  actions. Do not fold in.
- **SprintSlots** — right-click on the sprint slot tab (slot management), not a row.
- **Legacy `TicketRow` / `/compare`** — being phased out.

## Implementation Plan

Decided via an Opus plan + codebase verification. Build order keeps the tree green at every commit:
introduce registry + adapter + wrappers behind the existing components, then migrate one surface at a time.

**Resolved open questions:** modals stay host-mounted (hook returns signals); small **adapter object** (no
union type); inbox row enrichment stays out of scope (flag/readiness write-through, `flagState:"mixed"`).

**Data contract — `RowActionsAdapter`:** `getTicket(key) → TicketLike | undefined`, `patch(key, partial)`
(optimistic display write), `mutate()` (revalidate). Each surface wires `patch`/`mutate` to its EXISTING
optimism so nothing regresses — board → `registerPendingEdit`/`registerPendingMove` overlay (never list
cache); epic → `onChildOptimistic` + `setLocalMoves`/`setLocalMetrics`; inbox → `setLocalMoves` (write-through).

**Steps (each a commit):**
1. **Group registry** — new `src/components/sprint-board/row-actions/groups.ts`: typed `GroupId`/`Group`/`Action`/
   `SurfaceDescriptor` ported from the prototype, locked names/icons. Pure, no wiring. + `groups.test.ts`.
2. **Quick-move labels** — `src/lib/quick-moves.ts`: labels become "Move to active/next/backlog" + add a
   `target` field (destination chip). Keep ids/ordering/de-dup/`badge:"active"`. Update `quick-moves.test.ts`,
   `ticket-action-menu.test.tsx`.
3. **Generalise `useTicketActions` onto the adapter** — replace `apiTickets`/`mutateTickets` deps with the
   adapter; `find` → `getTicket`, `mutate` → `adapter.mutate`. Board-specific bulk-move destination-cache
   injection becomes an optional `adapter.onBulkMoveCommitted` capability (board-only; inbox/epic no-op).
   Provide `makeBoardAdapter(...)`. Update `useTicketActions.test.ts`; keep `SprintBoard.moveMeter.test.tsx` green.
4. **`useRowActions` composition hook** — new; owns `rowMenu`+`handleRowContextMenu`, `quickMovesFor`/
   `handleQuickMove`+create-sprint signal, flag-state (`getTicket().flagged`, "mixed" when absent),
   `flagPolicy` capability (board="confirm", others="immediate"), review/subtasks/refine orchestration.
   Returns `{ menuProps, barProps, signals }`. + `useRowActions.test.ts`.
5. **Thin wrappers** `RowContextMenu` + `RowBulkBar` — first as adapters over existing `TicketActionMenuContent`/
   `BulkActionBar` (behaviourally identical, tests stay green), then fold registry-driven rendering + agreed UX
   (named moves+chips, More sprints ▸ with generic buckets, Update/Assist nested, Add to refinement ▸, caret
   cue, Mark-as-read primary, SP/BV optional, clusters, hug). Rewrite `BulkActionBar.test.tsx`/
   `ticket-action-menu.test.tsx` only at the UX-fold. + `RowContextMenu.test.tsx` / `RowBulkBar.test.tsx`.
6. **Migrate Inbox** — replace + delete `useInboxRowActions.ts`; inbox adapter; `markRead` stays in page as
   Triage action. Re-home `useInboxRowActions.test.tsx`; keep `inbox/page.test.tsx` green.
7. **Migrate EpicChildrenSection** — remove inline `runBulk`; epic adapter; keep DnD handlers + plan-sprint flow
   in host. Keep `.optimistic/.plan-sprint/.reorder` tests green.
8. **Migrate SprintBoard** — board adapter; replace inline `CursorMenu`/`BulkActionBar` with wrappers; keep
   refresh/copy/export/create-sprint/flag-dialog in host wired from signals; `handleRankToEdge` = `rank` cap.
9. **Docs** — update `optimistic-updates.md` to describe the shared module + per-surface adapters.

**Risks / gaps flagged:** (a) board bulk-move destination-cache injection (BRDG-271) — model as `onBulkMoveCommitted`
capability, guard with moveMeter test; (b) `flagState` source via adapter (`getTicket().flagged` optional);
(c) flag-reason dialog divergence → `flagPolicy` capability; (d) "Export summary" is board-only → registry needs
**per-surface action gating** within an enabled group (prototype only gates at group level); (e) "More sprints ▸"
must partition pinned vs generic buckets (Overall refinement / Backlog) and host "Choose sprint…" (the current
searchable `SprintSubPanel`).

## Acceptance Criteria

- [ ] Actions are defined once in a group registry; both the right-click menu and the bulk bar render
      from it (no separately-maintained per-presentation lists). Adding an action to a group surfaces
      it in both presentations wherever that group is enabled.
- [ ] A surface gets the full menu + bar by supplying a data adapter, its enabled groups, capabilities
      (`rank`, `metrics`, triage), and `showToast` — no copied glue.
- [ ] `useTicketActions`' data dependency is generalised so a non-`Ticket[]` cache (the inbox's
      `NewStoriesResponse`) works through the adapter without forking the hook.
- [ ] Right-click menu matches the design: Triage leads (inbox only), **Move top-level with named
      sprint chips + More sprints ▸**, **Update ▸** and **Assist ▸** nested, Flag inline, **Add to
      refinement ▸**; Copy/Refresh absent from the menu.
- [ ] Bulk bar matches the design: icon-only with the **caret** cue on dropdown groups, **Mark as read
      labelled primary** (inbox), select-all checkbox + counter, **SP/BV counters optional per surface
      (off on inbox)**, edit/list-op clusters split by a divider, Clear at the end, background hugs content.
- [ ] Quick-move labels use "Move to active/next/backlog" + destination sprint chip, "active" wording,
      with More sprints holding remaining pinned + Overall refinement + Backlog + Choose sprint…
- [ ] `SprintBoard` and `EpicChildrenSection` migrate to the module; `useInboxRowActions` and the epic
      inline dispatch collapse into the shared path. Optimistic mechanics preserved exactly.
- [ ] No regression in board/epic/inbox context-menu, bulk-bar, quick-move, or auto-create behaviour.
- [ ] [optimistic-updates.md](../architecture/optimistic-updates.md) updated to describe the shared module.

## Tests

- [ ] The module renders the menu/bar from a surface descriptor + minimal adapter and dispatches the
      right API call for each action (per group).
- [ ] Per-surface composition: rank items appear only with `rank`; SP/BV counters only with `metrics`;
      Mark-as-read primary only with triage; Copy/Refresh never in the menu.
- [ ] The generalised adapter applies optimistic patches and reverts on failure for both a `Ticket[]`
      source and a `NewStoryRow` source.
- [ ] Quick-move computation + auto-create signalling work through the shared module (labels + "active"
      badge/wording, More sprints contents).
- [ ] Board / epic / inbox regression: existing context-menu, bulk-bar, quick-move, mark-as-read+undo
      tests pass after migration.

## Open Questions

- **Modal ownership.** Keep create-sprint / refine modal mounting in the host (recommended, avoids
  portal churn) vs. fold into the module via slots.
- **Adapter vs. union type.** Small adapter object (recommended) vs. widening the hook to a
  discriminated union of cache shapes.
- **Inbox row enrichment.** Whether to enrich `NewStoryRow` with `flagged`/`readiness`/`businessValue`
  so Flag/Update reflect state (vs. write-through). Tracked from BRDG-373; likely a separate story.

## Related

- [[BRDG-373-inbox-row-context-menu-and-bulk-actions]] — shipped the inbox surface with a local
  adapter this story collapses.
- [[BRDG-369-move-to-next-sprint-quick-action]] — quick-move logic folded into the Move group.
- [[BRDG-367-epic-children-adopt-board-row]] / `EpicChildrenSection` — second call site to migrate.
- Prototype: `src/app/dev/exploration/row-actions/page.tsx` (reachable at `/dev/exploration/row-actions`).
- Touch points: `useTicketActions`, `ticket-action-menu.tsx`, `BulkActionBar.tsx`, `quick-moves.ts`,
  `useInboxRowActions.ts`, `pendingTicketEdits`, `pendingSprintMoves`.
