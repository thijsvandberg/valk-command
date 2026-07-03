# UI Primitives

The shared component layer that every view builds on. Established by BRDG-419/420/421/422
(tokens, form controls, menu rows, modal/z-scale) and completed by the BRDG-427..431 wave
(one form scaffold, one anchored-panel engine, authoritative z tokens, one tooltip, one
toast body, Modal-hosted dialogs). **Reuse these; do not hand-roll lookalikes.** Guard
tests (`focus-ring-guard.test.ts`, `overlay-zindex-guard.test.ts`) fail the build style
of drift this doc exists to prevent.

## Form controls (`src/components/shared/`)

| Component | Purpose |
|-----------|---------|
| `TextInput` / `TextArea` / `Select` | The canonical field recipe: `border-strong` + `overlay-subtle` surface, subtle brand focus border (`focus:border-[var(--color-brand-500)]/40`, **no ring/glow** per PO preference), `disabled:opacity-50`, `placeholder:text-text-muted`. |
| `Field` | Label + control + error scaffold: `icon`, `hint` ("(optional)"), `labelEnd` (right-aligned action; forces a div container because interactive content inside a `<label>` misfires activation), `error` (renders `role="alert"` in `--color-status-error`), `as="div"` for button-based controls (e.g. `DateTimePicker`). |
| `ToggleSwitch`, `Checkbox` | Canonical switch/checkbox (BRDG-420/421). |

Deliberately NOT on the shared recipe: the StoryPointPicker number inputs (specialized
`h-10 w-10` entry) and the borderless-input-inside-bordered-container family
(palette/search/picker search rows).

## Anchored panels (`src/components/shared/AnchoredPanel.tsx`)

One primitive owns floating-panel behaviour; everything anchored routes through it:

- `useAnchoredPosition({ anchorRef | point, placement, gap, shiftPadding, fitViewport, enabled })`
  — floating-ui positioning (offset / flip / shift-clamp, optional `size()` max-height),
  `autoUpdate` scroll/resize tracking, cursor-point mode via a virtual element, the
  BRDG-303 collapsed-trigger hold, and a `seed()` for callers that gate rendering on `pos`.
  Placements include centered `top`/`bottom` (used by Tooltip).
- `AnchoredPanel` — the component: portal (default) or inline (`portal={false}` renders
  `absolute top-full` in the trigger's relative container), Escape + outside-mousedown
  dismissal (`dismissable={false}` for callers that own it), `insideRefs` so a trigger
  click toggles closed instead of close-then-reopen, render-prop children receive the
  fit-to-viewport `maxHeight`.

Routed through it: `Popover` (inline wrapper; optional `triggerRef`), `BasePicker` /
`usePickerState` (all pickers), `AnchoredMenu` + `CursorMenu` (board menus),
`FilterDropdown`, the pipelines/epics filter dropdowns, `Tooltip`. The `Flyout`
(nested hover sub-menus in the ticket action menu) intentionally keeps its CSS-relative
side positioning.

## Z-index scale (globals.css `@theme`)

Five tokens are the single source for overlay layering; raw z values on overlays fail
`overlay-zindex-guard.test.ts`:

```
z-dropdown 50 < z-modal 60 < z-popover 65 < z-tooltip 70 < z-notification 80
```

Assignment rule: page-level dropdown panels → `z-dropdown`; modal backdrops → `z-modal`;
interactive portal panels that may open inside a modal (pickers, action menus, calendars)
→ `z-popover`; tooltips + hover cards → `z-tooltip`; toasts → `z-notification`.
Deliberately below the scale: ChatLayout's mobile drawer and the InboxDigestBanner
(`z-40` layout layers that must never cover overlays).

## Modal (`src/components/shared/Modal.tsx`)

Focus trap + focus restore + Escape + drag-safe backdrop close + `z-modal` backdrop.
Nesting-safe since BRDG-431: a module-level modal stack lets only the TOPMOST open modal
trap Tab and handle Escape (launcher + nested ConfirmDialog). Options:

- `closeOnEscape={false}` — caller owns Escape (the command palette, where Escape means
  "back" inside a sub-flow).
- `unstyledBackdrop` + `backdropClassName` + `alignClassName` — caller animates its own
  backdrop / offset (palettes).
- Exit animations: keep `open` true while playing the closing transition, flip it after
  (CommandPalette's `closing` state is the reference implementation).
- `[data-autofocus]` marks the element Modal should focus on open.

`CommandPalette`, `SearchModal`, `StoryWriterLauncherModal`, `SplitStoryPicker` and
`ConfirmDialog` all render through Modal.

## Transient feedback (`src/components/ui/Toast.tsx`, `src/components/shared/Tooltip.tsx`)

- `ToastCard` — the one toast body: variant border tints (success / error / warning /
  neutral), blurred `surface-floating/95`, icon + content + `actions` + dismiss cross,
  fadeInUp entrance. `Toast` (transient status, bottom-6), the sync `ActivityToast`
  stack (bottom-4) and `ExportToasts` (bottom-16) all render it; the three mount points
  keep distinct offsets so simultaneous toasts never overlap. All on `z-notification`.
- `Tooltip` — the one text tooltip: hover/focus with delay, centered placement via the
  anchored-position engine, `z-tooltip`. Rich interactive hover cards
  (TicketStatusPill card, RefinementGemHoverCard) are hover *panels*, not tooltips —
  separate components on the tooltip layer.

## Menus

`MenuItem` / `MenuList` (BRDG-421) render the rows; `AnchoredMenu` (trigger-anchored),
`CursorMenu` (right-click) and `Flyout` (hover sub-panels) provide the surfaces.
