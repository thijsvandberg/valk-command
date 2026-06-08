# BRDG-310: Empty SP/BV reserve no space and reveal on hover, in natural order

**Status:** Done
**Priority:** Medium
**Type:** Improvement
**Related:** BRDG-239 (headerless board rows), BRDG-240 (inline SP/BV metric chips), BRDG-131 (epic pill), BRDG-298 (sprint/backlog badge)

## Description

As a PO scanning a ticket list, I don't want **empty** planning fields (epic / Story Points /
Business Value) to reserve blank space between badges. The previous behaviour kept the empty chips at
`opacity: 0` until row hover, which still reserved their width and opened a visible gap (e.g. between
a refinement gem and the assignee, or between the epic chip and the avatar).

New behaviour: **everything that is set** renders in its natural slot; the **still-empty (but
applicable)** planning fields reserve **no space** and open on **row hover** as a placeholder cluster
to the **LEFT of every set badge** (left of a set epic chip, a refinement gem, etc.). Among themselves
the placeholders keep the natural `epic → SP → BV` order ("zo veel mogelijk de juiste volgorde").

This applies to the inline-cluster list views (`BoardRow`, `EpicChildrenSection`). The dense column
table (`TicketRow`, used on `/compare` and the epics list) is intentionally left unchanged: its SP/BV
are fixed columns for alignment, not an inline cluster.

## Behaviour

### Sprint board row (`BoardRow`)

- **Set badges** (epic chip, set SP, set BV, plus the existing notes / refinement / flag / quality /
  sprint signals) render in their natural slots, unchanged.
- **Empty + applicable planning fields** (the "Add epic" placeholder, empty SP, empty BV) form a
  hover-revealed cluster placed to the **left of all set badges**, reserving no space when idle and
  ordered `epic → SP → BV` among themselves.
- **Empty + not applicable (deprecated):** SP/BV are suppressed entirely — no placeholder, not even on
  hover. A deprecated ticket that still carries a value keeps showing it.

Hover states, left-to-right (avatar omitted):

```
epic set, SP & BV empty:            [SP?] [BV?]  Epic
epic set, SP empty, BV set:         [SP?]        Epic   BV
refinement set, nothing else:       [+Epic] [SP?] [BV?]  Gem
nothing set:                        [+Epic] [SP?] [BV?]
all set:                            Epic     SP     BV
```

### Epic children list (`EpicChildrenSection`, incl. the by-sprint view)

- No epic chip in these rows, so empty SP/BV simply reveal on hover at the front of the metadata
  cluster (natural `SP → BV` order); set values render inline. Existing per-status logic is unchanged
  (deprecated children are filtered by the list's own "hide deprecated" toggle).

## Implementation

- **`src/components/shared/HoverRevealSlot.tsx` (new):** wraps an empty placeholder in
  `hidden shrink-0 group-hover/row:inline-flex` so a hidden slot is dropped from the flex flow entirely
  (no reserved width, no phantom `gap`), surfacing only on `group/row` hover. stopPropagation keeps a
  click on the picker from also selecting the row. Mirrors the existing `hidden group-hover/row:flex`
  pencil affordance.
- **`src/components/sprint-board/BoardRow.tsx`:** the empty (applicable) "Add epic" / SP / BV
  placeholders render in a `HoverRevealSlot` cluster placed right after the title (left of the notes /
  refinement / epic / metric slots). The epic chip slot now renders only a *set* epic; the trailing
  SP/BV slots render only *set* values. Flags: `showEpicPlaceholder`, `showSpPlaceholder`,
  `showBvPlaceholder` (gated by `!isDeprecated` for SP/BV) vs `showSpValue` / `showBvValue`.
- **`src/components/ticket-detail/EpicChildrenSection.tsx`:** `renderMetadata` renders SP then BV
  (empty -> `HoverRevealSlot`, set -> inline), then subtask/sprint/assignee.

## Requirements

- [x] Empty planning fields reserve **no horizontal space** (no gap, e.g. between a refinement gem and
      the assignee, or between the epic chip and the avatar)
- [x] On row hover, the empty placeholders open as a cluster to the **left of every set badge**,
      keeping the natural `epic → SP → BV` order among themselves
- [x] A set epic / SP / BV renders inline in its natural slot
- [x] With nothing set, the cluster is `+Epic → SP? → BV?`; with only a refinement gem set, the cluster
      opens to the left of the gem
- [x] Deprecated tickets keep the current suppression: empty SP/BV show nothing, not even on hover;
      a set value still shows
- [x] Applies to `BoardRow` and `EpicChildrenSection`; the dense `TicketRow` column table is unchanged
- [x] Tests cover the reveal-slot wrapping, left-of-set-epic and left-of-refinement ordering, the
      nothing-set cluster order, and deprecated suppression

## Out of Scope

- The dense `TicketRow` column table (`/compare`, epics list) — its fixed columns are intentional.
- Any change to the SP/BV picker popovers or the metric value colour ramps.
- New suppression rules (e.g. spikes) — only the existing deprecated suppression is kept.
</content>
</invoke>
