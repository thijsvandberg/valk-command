# BRDG-430: Unify the tooltip and toast implementations

**Status:** Not Started
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

- [ ] One tooltip implementation app-wide (on `z-tooltip`).
- [ ] One toast implementation/stack app-wide (on `z-notification`); `ExportToasts` and
      `sprintMoveToast` route through it.

## Tests

- [ ] Render/behaviour tests for the unified tooltip + toast.
- [ ] Existing toast/tooltip tests stay green.

## Related

- [[BRDG-422-unify-overlays-and-zindex-scale]] — parent (toast z-layer fixed there).
