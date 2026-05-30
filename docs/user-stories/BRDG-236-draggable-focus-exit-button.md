# BRDG-236: Draggable Focus-Mode Exit Button (Corner Snapping)

**Status:** To Do
**Priority:** Low
**Type:** Enhancement

## Description

When focus mode is active, a small floating "exit focus mode" button appears in the top-right corner of the viewport (the `Maximize2` button in `FocusModeWrapper.tsx`). Depending on the content of a view, this fixed corner can overlap something the PO wants to see or interact with.

The PO should be able to drag the exit button to any of the four viewport corners. Precise placement is not required: a quick drag/swipe in the rough direction of a corner should snap the button neatly into that corner.

## User Story

As a PO working in focus mode, I want to drag the floating exit button to a different corner so that it stays out of the way of whatever content I am focused on, without having to position it exactly.

## Requirements

### Drag and snap
- The floating exit button is draggable only while focus mode is active.
- The button can be dragged with mouse and touch.
- On drag end, the button snaps to the nearest of the four viewport corners (top-left, top-right, bottom-left, bottom-right).
- "Nearest corner" is determined by which viewport quadrant the button's center lands in at drop time. A short swipe toward a corner is enough; the button does not need to be released exactly in the corner.
- Snapping animates smoothly (spring-style easing), not an instant jump.

### Position persistence
- The chosen corner persists across page reloads and browser sessions (stored as a small UI preference in `localStorage`).
- Default corner remains top-right (current behavior) for users who never drag it.

### Interaction integrity
- A plain click (no drag) still exits focus mode, exactly as today. Distinguish click from drag using a small movement threshold so a click is never misinterpreted as a drag.
- The button keeps its existing subtle resting style (low opacity, brightening on hover) regardless of which corner it sits in.
- The button stays clear of the viewport edges with the same offset it uses now (it should not sit flush against the edge in any corner).

### Components affected
- `src/components/FocusModeWrapper.tsx`: the floating exit button (currently `fixed top-3 right-3`) becomes draggable and reads/writes its corner from state.
- New hook (suggested): `src/hooks/useCornerSnap.ts` (or similar) encapsulating drag tracking, quadrant detection, snap target, and the `localStorage`-backed corner preference. Co-located test file required.

## Design Notes

- Only animate `transform` and `opacity` for the snap and any drag feedback (no `transition-all`), consistent with the existing focus-mode animations.
- During drag, follow the pointer via `transform: translate(...)`; on release, transition to the resolved corner.
- Use a layered, low-opacity shadow consistent with the current button styling.
- Consider a brief, subtle visual cue (e.g. slight scale-up) while dragging so it reads as "grabbable".

## Out of Scope

- Arbitrary free-floating placement (the button always settles into one of the four corners).
- Keyboard-driven repositioning of the button.
- Repositioning any other UI element (this story covers only the focus-mode exit button).
- Multiple/custom snap zones beyond the four corners.

## Implementation Plan

### Conventions
- Reuse the existing `useLocalStorage<T>(key, default)` hook (SSR-safe, cross-tab sync) for persistence. Key namespacing convention is `bridge:<feature>`.
- Export pure helpers (e.g. quadrant logic) alongside the hook so they are unit-testable, following the `clampWidth` pattern.
- Use the Pointer Events API to cover mouse + touch + pen in one code path.

### 1. `useCornerSnap` hook (`src/hooks/useCornerSnap.ts`, new)
Exports:
- `type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right"`
- `CORNER_STORAGE_KEY = "bridge:focus-exit-corner"`, `DEFAULT_CORNER = "top-right"`, `DRAG_THRESHOLD_PX = 4`
- Pure helper `cornerFromPoint(x, y, vw, vh): Corner` (quadrant: `top = y < vh/2`, `left = x < vw/2`)
- Hook `useCornerSnap({ enabled, onClick })` returns `{ corner, isDragging, dragOffset, handlers: { onPointerDown }, ref }`

Internals: `useLocalStorage<Corner>` for `corner`; `useState` for `isDragging` and `dragOffset`; refs for gesture state (`startX/startY`, `pointerId`, `moved`, button rect at pointerdown).

### 2. Pointer handling (click vs drag)
- `onPointerDown` (only when `enabled`): ignore non-primary buttons, `setPointerCapture`, record start coords + rect, `moved = false`, attach window `pointermove`/`pointerup`/`pointercancel`. Do not set dragging yet.
- `pointermove`: once `hypot(dx,dy) > DRAG_THRESHOLD_PX`, set `moved = true`, `isDragging = true`, `preventDefault`; update `dragOffset = {x: dx, y: dy}`.
- `pointerup`/`pointercancel`: remove listeners, release capture. If `!moved` → call `onClick()` (exit). If `moved` → resolve `cornerFromPoint(center + offset)`, `setCorner`, clear `dragOffset`, `isDragging = false`.
- Route exit exclusively through `pointerup` (remove `onClick={exitFocusMode}`); add `onKeyDown` Enter/Space → `onClick()` for keyboard.

### 3. Wire into `FocusModeWrapper.tsx`
- Call the hook with `{ enabled: focusMode, onClick: exitFocusMode }`. Attach `ref`, spread `handlers`, add `onKeyDown`.
- Replace static `top-3 right-3` with a `CORNER_CLASSES[corner]` map (`top-3 left-3`, `top-3 right-3`, `bottom-3 left-3`, `bottom-3 right-3`) keeping the 0.75rem offset.
- Add `touch-none` so touch drags do not scroll. Keep all existing resting/hover/focus styling unchanged.

### 4. Snap animation (transform/opacity only)
- During drag: inline `transform: translate(dx, dy) scale(1.05)`, transition disabled, for 1:1 tracking + grab cue.
- On release: clear offset and update corner anchor; apply a short-lived spring transition `transition-[transform]` with overshoot easing `cubic-bezier(0.34, 1.56, 0.64, 1)`, gated by an `isSnapping` flag cleared on `transitionend`/timeout. To avoid a position jump when the anchor edge changes, compute a residual translate (`oldAnchorPos - newAnchorPos`) and animate it to `0`. Never use `transition-all`.

### 5. Tests (`src/hooks/useCornerSnap.test.ts`, new)
Mirror `useLocalStorage.test.ts`/`useColumnWidths.test.ts`. Cover: quadrant resolution for all 4 quadrants + center boundary; click-vs-drag (no-move → onClick, beyond-threshold → corner update, onClick not called); persistence (localStorage written, read back on fresh render, default `top-right`); `enabled=false` is a no-op. Stub `getBoundingClientRect`, `setPointerCapture`, `window.innerWidth/Height`.

### 6. Manual verification
Enter focus mode, drag to each corner (spring snap), reload (persistence), plain click exits. Run `npm run verify` + `npm run build`.

### Gaps / notes
- Continuous snap math (anchor-delta) is the trickiest visual piece.
- jsdom does not implement `setPointerCapture`/`PointerEvent` fully; tests assert logic via stubs, not layout.
- `useLocalStorage` renders default first then hydrates, so a one-frame top-right paint is expected (button hidden until focus mode anyway).

## Checklist

- [x] Create `useCornerSnap` hook with drag tracking, quadrant detection, and `localStorage` persistence
- [x] Distinguish click (exit) from drag using a movement threshold
- [x] Make the floating exit button draggable while focus mode is active
- [x] Snap to nearest corner on release with spring-style animation
- [x] Persist chosen corner across reloads and sessions; default to top-right
- [x] Keep existing subtle resting/hover styling in all four corners
- [x] Tests for `useCornerSnap` (quadrant resolution, click-vs-drag, persistence)
- [ ] Manual test: drag to each corner, reload, and confirm click-to-exit still works
