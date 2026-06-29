# BRDG-432: Lightbox zoom, gallery navigation and caption

**Status:** Done
**Priority:** Medium
**Type:** Feature

## Status

Shipped on `dev`. `ImageLightbox` gained cursor-anchored wheel/pinch zoom,
double-click toggle, drag-to-pan (clamped, with grab/grabbing cursors), `+`/`-`/`0`
keyboard zoom, an optional `gallery` (prev/next buttons + ArrowLeft/Right, an
`n / total` counter clamped at the ends) and a filename caption pill. Zoom/pan
reset on close and on image change. `AttachmentsSection` wires the full ordered
image list (skipping cleaned/non-image entries) into each thumbnail; single-image
attachments and markdown images keep today's single-image behaviour (no nav).

Verified end-to-end in the running app on VPL-36166 (22 image attachments):
wheel zoom (scale 1 → 1.72), drag pan (exact pointer delta), double-click toggle
(fit ↔ 2.5x), ArrowRight + Next button navigation with a live `n / 22` counter and
caption, prev disabled at first / next disabled at last (no wrap), reset on
navigate and on close/reopen, and Escape / backdrop / close-button dismiss with
body-scroll lock. A markdown-embedded image opened with no nav controls or
counter. No console errors or warnings. lint, typecheck, full test suite (7073
tests) and build all green.

## Description

When viewing an image fullscreen in the lightbox, the PO wants to be able to **zoom in** (and pan around) to read fine detail — e.g. a screenshotted DevTools panel where the request URL and headers are tiny. Today the lightbox only scales the image to fit the viewport; there is no way to inspect detail.

While in there, two adjacent improvements were confirmed in scope:
- **Gallery navigation** — when a ticket has multiple image attachments, browse prev/next inside the lightbox (arrow keys + on-screen buttons + a "3 / 8" counter) instead of closing and reopening each thumbnail.
- **Caption** — show the image's filename / alt text in the lightbox so it's clear which attachment you're looking at.

> Note: there is **no third-party lightbox library** in this project. The lightbox is a small custom component (`src/components/shared/ImageLightbox.tsx`, ~90 lines). So "what else does the lib offer" is really "what do we build onto our own component". This story extends that component natively; it does **not** introduce a lightbox dependency (consistent with the project's custom-Tailwind, no-component-library convention).

## Current Behaviour

- **Component:** `src/components/shared/ImageLightbox.tsx`. A button wraps the trigger (a plain `<img>` or arbitrary `children`); clicking opens a portal-rendered modal (`createPortal` into `document.body`) with a `bg-black/80 backdrop-blur-sm` overlay.
- The modal renders a single `<img className="max-h-[90vh] max-w-[90vw] object-contain">`. **No zoom, no pan, no navigation, no caption.**
- Dismiss: Escape (capture-phase keydown), backdrop mousedown, or the close button (top-right). Body scroll is locked while open.
- **Used in two places, both feeding `/api/attachments/{id}`:**
  - `src/components/ticket-detail/AttachmentsSection.tsx` (lines ~48-63): a 3-column thumbnail grid; each image attachment is wrapped in its **own independent** `ImageLightbox`. The component already holds the full `attachments` array, so the natural gallery source already exists here.
  - `src/components/ticket-detail/renderMarkdown.tsx` (inline images ~181-189, block images ~808-814): embedded `/api/attachments/...` images in ticket/story descriptions and Story Writer chat. These are scattered, single images.
- Plain `<img>` is used deliberately (not `next/image`): the `/api/attachments` route is cookie-protected and the Next optimizer fetches it server-side without the session cookie, getting a 401.

## Proposed Approach

Extend the existing `ImageLightbox` component; keep its current trigger API and call sites working unchanged when no gallery is supplied.

### 1. Zoom + pan (the core ask)
- Add zoom state (scale + offset) to the open modal.
- **Zoom in/out:** mouse wheel / trackpad scroll over the image, zooming toward the cursor. Trackpad pinch on macOS arrives as a `wheel` event with `ctrlKey`, so the same handler covers pinch. Double-click toggles between fit and a fixed zoom level.
- **Pan:** when zoomed in, drag to pan; cursor reflects state (`zoom-in` → `grab` → `grabbing`). Clamp the offset so the image can't be dragged completely off-screen.
- **Reset:** zoom/offset resets to fit on close and whenever the active image changes (gallery navigation).
- **Keyboard (nice-to-have, low cost):** `+` / `-` to zoom, `0` to reset.
- Animate only `transform` (spring-style easing), never `transition-all` — per the frontend guardrails.

### 2. Gallery navigation
- Give `ImageLightbox` an **optional** `gallery` input: an ordered list of `{ src, alt }` plus the `index` of this trigger within it. When present, the modal shows prev/next chevron buttons, responds to `ArrowLeft`/`ArrowRight`, and renders a `"{n} / {total}"` counter. When absent, behaviour is exactly as today (single image, no nav).
- Navigation **clamps** at the ends (buttons disabled at first/last) rather than wrapping — predictable for a small set. <!-- minor default; see Open Questions if wrap is preferred -->
- Wire it up in `AttachmentsSection.tsx`: build the `{src, alt}` list once from the image attachments (skip `cleaned` / non-image entries) and pass the list + each item's index to its `ImageLightbox`. Only one modal is open at a time, so each thumbnail keeping its own `ImageLightbox` instance is fine — no shared-context refactor required.
- **Out of scope:** grouping the scattered markdown images in `renderMarkdown.tsx` into a gallery (they stay single, as today). Parked below.

### 3. Caption
- When `alt` (the filename, in the attachments case) is present, show it as a subtle caption at the bottom of the modal (e.g. a translucent pill). With a gallery, the caption sits next to / above the counter.

### Non-goals (explicitly out of scope)
- Adopting a third-party lightbox library.
- Download button, sharing, slideshow autoplay, thumbnail strip.
- Zoom on `<video>` attachments (videos keep native controls).
- Gallery navigation across markdown-embedded images.

## Open Questions
- **Markdown-embedded image gallery.** Inline/block images rendered by `renderMarkdown.tsx` remain single (no prev/next). Default: leave as-is; revisit only if browsing description images becomes a real need. Doing it later would need a shared lightbox context that collects sibling images in a rendered block.
- **Navigation wrap vs clamp.** Default: clamp (disable buttons at the ends). Switch to wrap-around (cyclic) only if the PO prefers continuous browsing — trivial to change.

## Implementation Plan
1. **Zoom/pan in `ImageLightbox.tsx`** — add scale/offset state, wheel + double-click zoom (cursor-anchored), drag-to-pan with clamping, reset-on-close, transform-only animation, cursor states.
2. **Gallery support in `ImageLightbox.tsx`** — optional `gallery: {src,alt}[]` + `index` props; prev/next buttons, arrow-key handlers, counter; reset zoom on image change; no-op when `gallery` is absent.
3. **Caption in `ImageLightbox.tsx`** — render `alt` as a caption in the modal.
4. **Wire `AttachmentsSection.tsx`** — build the image list and pass list + index to each thumbnail's `ImageLightbox`.
5. **Tests** — extend `ImageLightbox.test.tsx`.

## Acceptance Criteria
- [x] Scrolling / trackpad-pinching over the open image zooms in and out, anchored to the cursor. <!-- ImageLightbox.tsx wheel handler (ctrlKey covers pinch) -->
- [x] Double-click toggles between fit-to-screen and a zoomed level. <!-- ImageLightbox.tsx -->
- [x] When zoomed in, dragging pans the image; it cannot be dragged fully off-screen; cursor shows grab/grabbing. <!-- ImageLightbox.tsx pointer handlers + clamp -->
- [x] Zoom and pan reset to fit when the lightbox closes and when the active image changes. <!-- ImageLightbox.tsx -->
- [x] With multiple image attachments, prev/next buttons and Arrow Left/Right move between them inside the lightbox without closing it. <!-- ImageLightbox.tsx gallery nav + AttachmentsSection.tsx wiring -->
- [x] A "{current} / {total}" counter is shown when a gallery is present; nav buttons are disabled at the first/last image. <!-- ImageLightbox.tsx -->
- [x] The image's filename/alt is shown as a caption in the lightbox when available. <!-- ImageLightbox.tsx -->
- [x] Existing single-image usages (markdown inline/block images) keep working unchanged with no gallery and no regressions. <!-- renderMarkdown.tsx call sites; gallery prop optional -->
- [x] Escape, backdrop click, and the close button still dismiss the lightbox; body scroll stays locked while open. <!-- ImageLightbox.tsx -->

## Tests
- [x] Wheel event over the image increases scale; reverse decreases it; clamped to min (fit) and a max. <!-- ImageLightbox.test.tsx -->
- [x] Double-click toggles zoom; drag updates the pan offset only when zoomed. <!-- ImageLightbox.test.tsx -->
- [x] Closing and re-opening, and navigating to another image, resets scale/offset. <!-- ImageLightbox.test.tsx -->
- [x] With a gallery prop, Arrow Right/Left and the nav buttons change the displayed image and the counter; buttons disabled at the ends. <!-- ImageLightbox.test.tsx -->
- [x] Without a gallery prop, no nav controls/counter render and behaviour matches today. <!-- ImageLightbox.test.tsx -->
- [x] Caption renders the alt text when provided, and is absent when not. <!-- ImageLightbox.test.tsx -->
- [x] AttachmentsSection passes the correct ordered image list and index so opening the 2nd thumbnail starts the gallery at index 1. <!-- AttachmentsSection.test.tsx (new) or ImageLightbox.test.tsx -->

## Related
- `src/components/shared/ImageLightbox.tsx` — the component being extended; `ImageLightbox.test.tsx` alongside it.
- `src/components/ticket-detail/AttachmentsSection.tsx` — gallery source (full attachments array).
- `src/components/ticket-detail/renderMarkdown.tsx` — other call site; stays single-image.
- [[project_shared_ui_primitives_convergence]] — reuse shared primitives / z-index tokens (`z-modal`) rather than re-hand-rolling.
