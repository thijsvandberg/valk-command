# BRDG-430: Unify the tooltip and toast implementations

**Status:** Done (2026-07-03, branch ui-wave-427-431)
**Priority:** Low
**Type:** Consistency — transient-feedback overlays (follow-up of BRDG-422)

## Description

There are ~4 distinct tooltip implementations and ~4 distinct toast implementations.
BRDG-422 already put the toasts on the dedicated `z-notification` layer, but the
components themselves are still duplicated, so a styling/behaviour change has to be
made in several places. Each should collapse to one component. (Two related but
independent components — they can be done in either order or split if preferred.)

## Evidence (file:line)

Tooltips:
- `shared/Tooltip.tsx` (the main one, `zIndex:9999`), plus 3 other ad-hoc tooltip/hover-card
  patterns across the app (e.g. the `title=` fallbacks and bespoke hover cards).

Toasts:
- `ui/Toast.tsx` (single transient toast, `z-notification`), `sync/SyncToast.tsx` (stack,
  `z-notification`), `sprint-board/ExportToasts.tsx`, `sprint-board/sprintMoveToast.tsx`.

## Proposed approach

1. **Tooltip:** standardize on `shared/Tooltip.tsx`; replace the ad-hoc tooltip/hover patterns.
   Use the `z-tooltip` token.
2. **Toast:** one toast component + one stack/queue; route `ExportToasts` and `sprintMoveToast`
   through it. Keep `z-notification`.
3. Verify positioning/stacking and that nothing regresses on the busy views (board, pipelines).

### Trade-offs
- Low risk, low urgency, mostly internal-consistency value.

## Acceptance Criteria

- [x] One tooltip implementation app-wide (on `z-tooltip`).
- [x] One toast implementation/stack app-wide (on `z-notification`); `ExportToasts` and
      `sprintMoveToast` route through it.

## Tests

- [x] Render/behaviour tests for the unified tooltip + toast.
- [x] Existing toast/tooltip tests stay green.

## Implementation notes (2026-07-03)

- **Tooltip:** `shared/Tooltip` is the single text tooltip; its bespoke
  clamp/flip math was replaced by the shared `useAnchoredPosition` engine
  (BRDG-429) with new centered `top`/`bottom` placements. Same look, same
  delay/focus behaviour, `z-tooltip` token.
- **Toast:** new `ToastCard` in `ui/Toast.tsx` owns the one toast body (variant
  border tints, /95 blurred surface, icon + content + actions + dismiss cross,
  fadeInUp entrance). `Toast`, the sync `ActivityToast` stack items and
  `ExportToasts` all render through it. `sprintMoveToast` already routed
  through `Toast` (story evidence predated that convergence).
- Judgment calls:
  1. One toast *body*, three mount points: the standard toast (bottom-6), sync
     stack (bottom-4) and export cards (bottom-16) keep their offsets so
     simultaneous toasts don't overlap. Collapsing them into one global queue
     would rewire `useToast` + ActivityContext + export state and was judged
     too broad for this pass.
  2. Skin convergence: the standard toast adopts the family skin (tinted
     border + blurred surface); sync-toast dismiss becomes the standard cross
     and its JS entrance transition becomes the shared fadeInUp keyframe.
  3. The rich hover cards (TicketStatusPill card, RefinementGemHoverCard) are
     interactive hover panels, not text tooltips - kept as components on the
     `z-tooltip` layer. `OpenSubtasksIndicator` is click-driven (panel family,
     `z-popover`).

## Related

- [[BRDG-422-unify-overlays-and-zindex-scale]] — parent (toast z-layer fixed there).
