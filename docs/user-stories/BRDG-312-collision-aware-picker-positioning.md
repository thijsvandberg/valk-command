# BRDG-312: Collision-aware picker positioning (no more off-screen dropdowns)

**Status:** Done
**Priority:** Medium
**Type:** Bugfix / Improvement
**Related:** BRDG-201 (extract BasePicker), BRDG-249 (navigate to epic from picker), BRDG-310 (empty SP/BV hover reveal), BRDG-188 (label picker), BRDG-135 (story point picker)

## Description

As a PO interacting with pickers on the board, I don't want a dropdown to open off the edge of the
screen and clip its content. The epic picker (and other pickers) can render partly outside the
viewport: when the trigger chip sits near the right edge of the screen, the panel anchors to the
trigger and overflows to the right with no correction. This happens often enough that fixing it
case-by-case is the wrong approach.

We want a **structural** fix in the one shared positioning primitive so that **every** picker built on
it becomes collision-aware at once, instead of patching individual components.

## Root cause

All pickers (epic, assignee, version, label, story point, business value, sprint, watcher, etc.) share
the `usePickerState` hook in `src/components/shared/BasePicker.tsx`. Its current positioning only solves
the vertical axis:

- **Vertical:** it flips the panel up when there isn't enough room below (`flipUp`).
- **Horizontal:** it blindly anchors to the trigger's left or right edge based on the `align` prop, with
  **no overflow correction**. When the trigger is near the right edge and `align="left"` (as the epic
  picker uses on `BoardRow`), the panel runs straight off the right side of the viewport.

`@floating-ui/dom` is already a project dependency but is currently unused. It provides exactly the
collision middleware needed (`flip`, `shift`, `offset`, `size`).

## Approach

Rewrite the positioning logic inside `usePickerState` to use Floating UI's `computePosition` with
`flip()` + `shift()` + `offset()` middleware (and optionally `size()` to cap height to available space).
Keep the public `BasePicker` API (`Root`, `Trigger`, `Popover`, `List`, `Item`, `Search`, `align`,
`popoverHeight`, portal mode) unchanged so no consumer needs to change.

Because every picker flows through this single hook, the fix applies to all of them with no per-component
edits.

## Implementation

- **`src/components/shared/BasePicker.tsx`:** replace the manual `getBoundingClientRect()` math in
  `usePickerState` (`updatePosition` / `getPopoverStyle`) with `@floating-ui/dom`'s `computePosition`
  using `flip` (auto-switch top/bottom and left/right), `shift({ padding })` (slide back into the
  viewport so edges are never clipped), and `offset(4)` (preserve the existing 4px gap). Map the `align`
  prop to a Floating UI `placement` (`bottom-start` / `bottom-end`). Keep portal + `position: fixed`
  rendering and the existing scroll/resize reposition behaviour (prefer `autoUpdate` if it cleanly
  replaces the manual scroll listener).

## Implementation Plan

All work is in the single shared hook `usePickerState` in `src/components/shared/BasePicker.tsx`. The
public surface that must stay stable is the hook return shape (`open`, `pos` used as a truthy render
gate, `getPopoverStyle()` spread onto a `position: fixed` div, `triggerRef`, `popoverRef`,
`handleOpen`, `handleClose`) — direct consumers (`StoryPointPicker`, `BusinessValuePicker`,
`ChildIssueComposer`, `EpicTeamPicker`, `EpicColorPicker`) rely on exactly this, plus all
`BasePicker.*` compound pickers. No consumer reads `pos.top/left/flipUp`, so the internal `pos` shape
is free to change.

1. **Import floating-ui** (`computePosition`, `autoUpdate`, `offset`, `flip`, `shift`) from
   `@floating-ui/dom` (already a dependency, currently unused).
2. **Change `PickerPosition`** from `{ top, left, flipUp }` to floating-ui's computed `{ x, y }`
   (covers checkboxes 1-4 — collision-corrected coordinates).
3. **Rewrite `updatePosition`** to call `computePosition(trigger, popover, { strategy: "fixed",
   placement, middleware: [offset(4), flip(), shift({ padding: 4 })] })`. Map `align="left"` →
   `bottom-start`, `align="right"` → `bottom-end`. `flip()` keeps the bottom-edge flip-up (cb 2),
   `shift()` clamps left/right into the viewport (cb 1, 3), `offset(4)` preserves the 4px gap (cb 4).
4. **Provisional sync pos in `handleOpen`** from the trigger rect so the portal popover mounts
   immediately (render is gated on `pos`), breaking the chicken-and-egg with the measured async pass.
5. **Replace the scroll-only `useEffect` with `autoUpdate`** (cb 6 — scroll + resize + element resize),
   returning its cleanup to avoid listener leaks across the many pickers.
6. **Rewrite `getPopoverStyle`** to return `{ position: "fixed", top: pos.y, left: pos.x, ... }` keeping
   the same `backgroundColor`/`boxShadow` so output stays API-compatible (cb 5).
7. **Keep `popoverHeight`** in the options interface (accepted, no longer needed for flip since
   floating-ui measures the real element) so no call site changes (cb 5).
8. **Tests** (cb 7): `vi.mock("@floating-ui/dom")` with a scripted `computePosition` + `autoUpdate`.
   Assert the placement maps correctly per `align`, the middleware includes `offset(4)`/`flip`/`shift`,
   the resolved `{x,y}` is applied to the rendered panel's inline style, and `autoUpdate` is set up on
   open and torn down on close/unmount. Note: jsdom has no layout, so containment is verified at the
   contract level (placement + middleware + output-application), not via real geometry.

## Requirements

- [x] A picker opened near the **right** edge of the viewport stays fully on-screen (shifts/flips instead
      of clipping) — verified with the epic picker on a `BoardRow` whose chip sits at the right edge
- [x] A picker opened near the **bottom** edge still flips up (no regression to current `flipUp`)
- [x] A picker opened near the **left** edge stays on-screen
- [x] The 4px gap between trigger and panel is preserved
- [x] The `BasePicker` public API and all consumer call sites are unchanged (no edits required in
      `EpicPicker`, `AssigneePicker`, `VersionPicker`, `LabelPicker`, `StoryPointPicker`,
      `BusinessValuePicker`, `SprintPicker`, `WatcherPicker`, etc.)
- [x] Panel repositions correctly on scroll and window resize
- [x] Tests cover the collision cases (right-edge shift, bottom-edge flip, left-edge clamp) and confirm
      the panel rect stays within the viewport

## Out of Scope

- Standalone dropdowns that do **not** use `BasePicker` and roll their own positioning
  (`SprintSelectDropdown`, `SessionSelectDropdown`, `FilterDropdown`, `TicketStatusPill`,
  `UserProfilePopover`, `FieldFilterPopover`). These are noted as a follow-up migration to the shared
  hook but are not part of this story.
- Any visual restyling of the picker panels (shadows, colours, search field) — positioning only.
- Animations / open-close transitions.
