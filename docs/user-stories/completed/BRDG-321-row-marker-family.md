# BRDG-321: Unified row meta-marker family (Refinement / SP / BV)

**Status:** Done
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

## Implementation Plan

### Architecture
- **New `src/components/shared/MetaMarker.tsx`** — the production version of the exploration primitives. Exports `ChipStyle`, `fgVars()`, `SP_STYLE` (slate), `BV_STYLE` (violet), `REFINE_STYLE` (brand teal), `MetaChip` (SP/BV chip + dashed inset draft), `RefineMarker` (icon-only `Boxes`, no count).
- **`src/types/ticket.ts`** — flatten `SP_COLORS`/`BV_COLORS`/`GUESS_COLORS` ramps to single theme-aware tones. `getSpColor`/`getBvColor`/`getGuestimationColor` return one tone regardless of magnitude (keep `0` = neutral N/A). Use `--meta-sp-fg`/`--meta-bv-fg` CSS vars + `color-mix(... 18%, transparent)` bg. This single change re-hues every picker, `MetricBadge`, and `MetricChip` at once.
- **`src/app/globals.css`** — add `.expfg{color:var(--fg-d)}` + `[data-theme="light"] .expfg{color:var(--fg-l)}` (mirrors the existing `.status-count-*` pattern), and `--meta-sp-fg`/`--meta-bv-fg` under `:root` and `[data-theme="light"]`.

### Order (centralized first, then call sites)
1. `globals.css` — `.expfg` rule + meta fg vars.
2. `src/types/ticket.ts` — flatten ramps to flat theme-aware slate/violet.
3. `src/components/shared/MetaMarker.tsx` (new) — port primitives from the exploration page.
4. `MetricBadge.tsx` — `Gauge→Hash`, `Goal→TrendingUp`; ramp already gone via step 2.
5. `StoryPointPicker.tsx` — trigger icon `Gauge→Hash` (lg + dense); green ramp gone via step 2.
6. `BusinessValuePicker.tsx` — trigger icon `Goal→TrendingUp`; amber ramp gone.
7. `GuestimationPicker.tsx` — align provisional estimate to dashed-inset slate `Hash` (same outer size as committed SP).
8. `RefinementGemHoverCard.tsx` — `SessionSection` header `Gem→Boxes`, theme-aware teal; keep hover behaviour.
9. `IssueMetaBadges.tsx` — `MetricChip` new icons/flat tone; `InRefinementBadge` `Gem→Boxes`, theme-aware.
10. `BoardRow.tsx` — `Gem→Boxes` AND remove session-count badge; confirm SP/BV slots + BRDG-310 reveal align.
11. `TicketRow.tsx` — dense `Gem→Boxes` (no count); SP/BV re-hue via step 2.
12. `TicketTable.tsx`/`TicketTableCells.tsx` — verify cells reflect new chips.
13. `SidePanel.tsx`, `BulkActionBar.tsx`, `TicketStatusPill.tsx`, `TicketMetaContent.tsx`, `RefinementPageContent.tsx`, `AddToRefinementModal.tsx` — `Gem→Boxes` where literal; SP/BV auto.
14. `EpicChildrenSection.tsx`/`ChildIssueRow.tsx` — verify SP/BV slot re-hue + align.
15. Verify-only: `tickets/[key]/page.tsx`, `refinement/history/page.tsx`, stakeholder + dashboard. Tier 3 no-touch: `command-palette/ResultItem.tsx` (epic gem), `nav/NavPanel.tsx`, `story-writer/StoryWriterLayout.tsx`, `SprintBoard.tsx`.

### Notes / decisions resolved during planning
- Two-track theme-awareness: standalone display markers use `.expfg` class; the picker path uses inline `style` so it resolves through `--meta-*-fg` CSS vars. Both are theme-aware.
- N/A (value 0) stays neutral grey — it's a distinct semantic, not a magnitude.
- Picker popover preset swatches all render the same flat tone (intended: "no ramp"); active-selected inversion stays (selection state, not a ramp).
- `GUESS_COLORS`/`getGuestimationColor` may become dead after step 7 — confirm no other consumer before removing.

### Tests
Update existing tests (`MetricBadge`, `StoryPointPicker`, `BusinessValuePicker`, `GuestimationPicker`, `IssueMetaBadges`, `RefinementGemHoverCard`, `BoardRow`, `TicketRow`) + new `MetaMarker.test.tsx`. Assert icon identity (`.lucide-hash`/`.lucide-trending-up`/`.lucide-boxes`), theme-aware var/class, dashed draft same outer size, and refinement no-count.

## Scope — apply everywhere

### Tier 1 — centralized components (the bulk of the change)
- [x] `src/components/shared/StoryPointPicker.tsx` — icon `Gauge` → `Hash`; remove green ramp, use one theme-aware **slate** tone; trigger (lg + sm/dense), popover presets, and the empty/placeholder state.
- [x] `src/components/shared/BusinessValuePicker.tsx` — icon `Goal` → `TrendingUp`; remove amber ramp, use one theme-aware **violet** tone; trigger (lg + sm/dense), popover presets, empty/placeholder.
- [x] `src/components/shared/GuestimationPicker.tsx` — align the provisional estimate to the **dashed inset slate `Hash`** treatment (replaces `Pencil` + dashed), same size as the committed SP chip. (See Decision 2.)
- [x] `src/components/sprint-board/RefinementGemHoverCard.tsx` — `SessionSection` header: `Gem` → `Boxes`, teal, **theme-aware**; hover card behaviour kept.
- [x] `src/components/shared/MetricBadge.tsx` — SP/BV display badge: new icons + flat theme-aware tones.
- [x] `src/components/shared/IssueMetaBadges.tsx` — `MetricChip` (SP/BV new icons/tones) **and** `InRefinementBadge` (`Gem` → `Boxes`, theme-aware).

### Tier 2 — call sites to verify render correctly after the core change
- [x] `src/components/sprint-board/BoardRow.tsx` — refinement marker `Gem` → `Boxes` **and removed the session count badge**; SP/BV slots + hover-reveal placeholders still align (BRDG-310 preserved, asserted in test).
- [x] `src/components/sprint-board/TicketRow.tsx` — dense table: gem column → `Boxes` (no count); SP/BV re-hue via the centralized tones.
- [x] `src/components/sprint-board/TicketTable.tsx` / `TicketTableCells.tsx` — no own SP/BV/gem icons; cells delegate to the pickers/`MetricChip`, so they re-hue automatically (verified by grep + suite).
- [x] `src/components/sprint-board/SidePanel.tsx` — "Add to refinement" `Gem` → `Boxes`.
- [x] `src/components/sprint-board/BulkActionBar.tsx` — `Gem` → `Boxes`; `MetricBadge` re-hues automatically.
- [x] `src/components/shared/TicketStatusPill.tsx` — "In refinement" cue `Gem` → `Boxes`, theme-aware; SP/BV via `MetricBadge`.
- [x] `src/components/ticket-detail/TicketMetaContent.tsx` — session-link `Gem` → `Boxes`; SP/BV pickers re-hue.
- [x] `src/components/ticket-detail/EpicChildrenSection.tsx` / `ChildIssueRow.tsx` — metadata slot uses pickers/`MetricChip`; re-hue automatically (no own icons).
- [x] `src/components/refinement-session/RefinementPageContent.tsx` — header `Gem` → `Boxes`.
- [x] `src/components/refinement-session/AddToRefinementModal.tsx` — `Gem` → `Boxes`.
- [x] `src/app/(app)/tickets/[key]/page.tsx` and `src/app/(app)/refinement/history/page.tsx` — `Gem` → `Boxes`.
- [x] Stakeholder view (`SprintOverviewCard` BV bands re-hued to violet, off amber; `.text`→`.solid` for opaque fills) + analytics (`sprint-stats-parts` `Gauge/Goal` → `Hash/TrendingUp`, `GroupStatBar` dots) — done.

### Tier 3 — collisions / explicitly out of scope
- [x] `src/components/command-palette/ResultItem.tsx` — left unchanged; the epic `Gem` and the nav-icon gems (NavPanel, palette-data, sidebar) are not refinement row markers and are untouched. No regression.

## Acceptance criteria

- [x] Refinement is shown with a teal `Boxes` glyph (icon-only, no count) in every list/table/detail/hover surface.
- [x] SP uses `Hash` in one slate tone; BV uses `TrendingUp` in one violet tone; no value ramp anywhere.
- [x] Provisional/guestimate SP shows as the dashed inset variant, identical in outer size to a committed SP chip (border-box keeps the dashed border inset).
- [x] All three markers are legible in **both light and dark theme** (verified: `--meta-*-fg` resolve to light text on dark `#cbd5e1/#c4b5fd/#3bbfbe` and dark text on light `#475569/#6d28d9/#075854`).
- [x] No amber/green/red used for SP/BV anywhere; markers read as metadata, not status.
- [x] Existing layout/spacing behaviour (BRDG-310 empty-field hover reveal, column alignment in the dense table) is unchanged.
- [x] Tests cover the marker rendering (icon + theme-aware class/var) for SP, BV, refinement and the dashed draft.

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
