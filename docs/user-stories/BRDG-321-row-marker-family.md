# BRDG-321: Unified row meta-marker family (Refinement / SP / BV)

**Status:** To Do
**Priority:** Medium
**Type:** Improvement
**Related:** BRDG-310 (empty SP/BV hover reveal), BRDG-240 (inline SP/BV metric chips), BRDG-239 (headerless board rows), BRDG-298 (sprint/backlog badge)
**Exploration:** `/dev/exploration/refinement-badge` (the chosen "Slate + Violet" direction)

## Description

As a PO scanning ticket lists, I want the three small meta markers that ride at the right edge of a
row — **Refinement** (in a refinement session), **SP** (story points / effort) and **BV** (business
value) — to read as one **cohesive family**: recognizable apart, obviously the same kind of thing, and
clearly *metadata* rather than a status.

Today they are inconsistent and partly misleading:
- Refinement uses a teal `Gem`, which reads as "premium" more than "refinement", and it carries a
  session **count** that is irrelevant when you are looking at a single ticket.
- SP uses a `Gauge` icon on a **green** value ramp.
- BV uses a `Goal` icon on an **amber** value ramp — amber reads as a **warning**.

This story re-hues and re-icons all three into the approved **Slate + Violet** family and applies it
**everywhere the markers render** (lists, dense tables, ticket detail, hover cards, refinement views,
side panel, bulk bar, analytics/stakeholder surfaces).

## Target design (approved)

| Marker | Hue | Icon | Shape |
|--------|-----|------|-------|
| **Refinement** | brand teal | `Boxes` | icon-only, **no session count** |
| **SP** (story points) | **slate** (neutral, "recedes") | `Hash` | filled chip + number |
| **BV** (business value) | **violet** ("premium/value") | `TrendingUp` | filled chip + number |
| **Penciled SP** (provisional / guestimate) | slate | `Hash` | **dashed inset** sub-variant of the SP chip |

Principles:
- **Cohesion:** identical chip geometry, opacity and type across SP/BV; only hue + icon differ.
- **Off the traffic-light hues:** no amber (warning), red/rose (error) or green (success) — these are
  metadata, not states.
- **Flat single tone (no value ramp):** SP is one slate tone, BV one violet tone, regardless of the
  number. The old green/amber magnitude ramps are removed entirely.
- **Dashed = not committed:** the penciled/guestimate variant uses a dashed border that is **inset**
  (the filled chip reserves a transparent 1px border) so the draft is exactly the same outer size as
  the committed chip.

## Theme-awareness (critical)

The app flips theme via the `[data-theme]` attribute on `<html>` and has **no working Tailwind `dark:`
variant**. A fixed Tailwind shade or fixed hex vanishes in one theme (this was the bug seen in the
exploration). Every marker must be theme-aware: **light text on dark, dark text on light**, with a
**transparent `color-mix` tint** fill that composites correctly over either surface. The existing
SP/BV ramps use fixed hex tuned for dark — these must be refactored to theme-aware values, not just
re-hued.

## Scope — apply everywhere

### Tier 1 — centralized components (the bulk of the change)
- [ ] `src/components/shared/StoryPointPicker.tsx` — icon `Gauge` → `Hash`; remove green ramp, use one theme-aware **slate** tone; trigger (lg + sm/dense), popover presets, and the empty/placeholder state.
- [ ] `src/components/shared/BusinessValuePicker.tsx` — icon `Goal` → `TrendingUp`; remove amber ramp, use one theme-aware **violet** tone; trigger (lg + sm/dense), popover presets, empty/placeholder.
- [ ] `src/components/shared/GuestimationPicker.tsx` — align the provisional estimate to the **dashed inset slate `Hash`** treatment (replaces `Pencil` + dashed), same size as the committed SP chip. (See Decision 2.)
- [ ] `src/components/sprint-board/RefinementGemHoverCard.tsx` — `RefinementGemTrigger` + `SessionSection` header: `Gem` → `Boxes`, teal, **theme-aware**; keep the hover card behaviour.
- [ ] `src/components/shared/MetricBadge.tsx` — SP/BV display badge: new icons + theme-aware ramps.
- [ ] `src/components/shared/IssueMetaBadges.tsx` — `MetricChip` (SP/BV new icons/ramps) **and** `InRefinementBadge` (`Gem` → `Boxes`, theme-aware).

### Tier 2 — call sites to verify render correctly after the core change
- [ ] `src/components/sprint-board/BoardRow.tsx` — refinement marker `Gem` → `Boxes` **and remove the session count badge**; confirm SP/BV slots + hover-reveal placeholders still align (BRDG-310 behaviour preserved).
- [ ] `src/components/sprint-board/TicketRow.tsx` — dense table: gem column → `Boxes` (no count), SP/BV columns re-hued.
- [ ] `src/components/sprint-board/TicketTable.tsx` / `TicketTableCells.tsx` — column cells reflect the new chips.
- [ ] `src/components/sprint-board/SidePanel.tsx` — marker rendering.
- [ ] `src/components/sprint-board/BulkActionBar.tsx` — marker rendering.
- [ ] `src/components/shared/TicketStatusPill.tsx` — list/hover variant SP/BV + any refinement cue.
- [ ] `src/components/ticket-detail/TicketMetaContent.tsx` — SP/BV pickers in the meta panel.
- [ ] `src/components/ticket-detail/EpicChildrenSection.tsx` — epic children row metadata (SP/BV).
- [ ] `src/components/ticket-detail/ChildIssueRow.tsx` — subtask metadata slot (SP/BV).
- [ ] `src/components/refinement-session/RefinementPageContent.tsx` — refinement session ticket list.
- [ ] `src/components/refinement-session/AddToRefinementModal.tsx` — marker rendering.
- [ ] `src/app/(app)/tickets/[key]/page.tsx` and `src/app/(app)/refinement/history/page.tsx` — verify.
- [ ] Stakeholder (read-only) view + Dashboard widgets / analytics that use `MetricBadge` — verify.

### Tier 3 — collisions / explicitly out of scope
- [ ] `src/components/command-palette/ResultItem.tsx` — the `Gem` here marks **epics** (purple), **not** refinement. Leave the epic icon unchanged; just confirm no regression now that refinement vacates the gem. (A later cleanup could reconcile the freed gem with epics, but not in this story.)

## Acceptance criteria

- [ ] Refinement is shown with a teal `Boxes` glyph (icon-only, no count) in every list/table/detail/hover surface.
- [ ] SP uses `Hash` in one slate tone; BV uses `TrendingUp` in one violet tone; no value ramp anywhere.
- [ ] Provisional/guestimate SP shows as the dashed inset variant, identical in outer size to a committed SP chip.
- [ ] All three markers are legible in **both light and dark theme** (verify by toggling theme).
- [ ] No amber/green/red used for SP/BV anywhere; markers read as metadata, not status.
- [ ] Existing layout/spacing behaviour (BRDG-310 empty-field hover reveal, column alignment in the dense table) is unchanged.
- [ ] Tests cover the marker rendering (icon + theme-aware class/var) for SP, BV, refinement and the dashed draft.

## Decisions

1. **Value ramp vs flat tone.** ✅ DECIDED: **no ramp.** SP = one slate tone, BV = one violet tone,
   regardless of value. The old green/amber magnitude ramps (`SP_COLORS` / `BV_COLORS`) are removed.
2. **Penciled SP vs existing Guestimate.** ✅ DECIDED: **yes** — the existing `GuestimationPicker`
   adopts the dashed inset slate `Hash` treatment; no separate concept.
3. **Refinement count removal.** ✅ DECIDED: **drop it.** The count badge in `BoardRow` only ever
   appeared when a ticket was in **more than one refinement session** (`refinementSessions.length > 1`);
   it is irrelevant in single-ticket context. Remove it — the full session list stays in the hover
   card and the refinement view.

## Notes

- Reference implementation of the theme-aware chip system, the ramps, and the dashed inset trick lives
  in the throwaway page `src/app/dev/exploration/refinement-badge/page.tsx`.
- Keep that exploration page until this ships, then it can be removed (move to `deleted/`).
