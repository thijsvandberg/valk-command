# BRDG-341: Wrap-Up Page Celebration — Corner Cannons & Ambient Success

**Status:** Ready to implement
**Priority:** TBD
**Type:** Story
**Design source:** `/dev/exploration/session-ending`, variant **J · Corner cannons** (chosen from A–J)

## Problem

Reaching the wrap-up of a refinement session means the queue is cleared — an achievement — but the wrap-up screen looks identical to every other session screen: a plain modal on a flat background. There is no moment of success anywhere in the flow (completing a session silently redirects to `/refinement`, where the finished session no longer exists).

## Goal

As the PO, when I finish the last ticket of a refinement session and land on the wrap-up screen, I want the page itself to celebrate the cleared queue — before I choose Save or Complete — so finishing a session feels rewarding instead of administrative.

The celebration lives **around** the modal, never in it. The modal (`SessionEndModal`) stays untouched, so pausing via Save feels just as appropriate as completing.

## Chosen design (exploration variant J)

Four layers behind/around the untouched modal, all theme-aware via CSS variables:

1. **Aurora field** — layered teal radial gradients rising from the bottom of the page, plus an SVG grain overlay for depth. Fades in on arrival.
2. **Halo** — a soft brand-teal radial bloom behind the modal that fades in and slowly breathes (scale/opacity loop).
3. **Headline** — one line above the modal: "Queue cleared" (display font, Sparkles icon) with a subline showing the real session numbers: `N tickets refined · N points · N minutes — wrap up below`.
4. **Corner cannons** — two one-shot confetti bursts fired diagonally from the bottom corners the moment the wrap-up appears. Multi-tone pieces (brand teal, light teal `#7fd9d4`, gold `#d9a441`, violet `#9d7bdd`, rose `#dd7e9b`), rotating as they fly, gone in under two seconds. They frame the modal, never cover it.

## Implementation Plan

1. **Keyframes in `src/app/globals.css`** — port the dev page's `se*` keyframes needed for variant J, renamed to the app convention: `wrapupFadeIn`, `wrapupFadeUp`, `wrapupBreath` (halo loop), `wrapupCannon` (uses `--dx`/`--dy`/`--spin` vars). Under `@media (prefers-reduced-motion: reduce)`, neutralize `wrapupBreath` (static halo). Cannons are gated in the component, not just CSS.
2. **New component `src/components/refinement-session/SessionWrapUpCelebration.tsx`** — `"use client"`, takes `children` (the modal). Ports `seededRand` (deterministic, 2-decimal rounded), `GRAIN` data-uri, `CONFETTI_TONES`, `AuroraField`, `AmbientHalo`, `CannonSide` (20 pieces per side, `data-testid` hook for tests), `QueueClearedHeadline`. Reads `queue`, `sessionEstimates`, `sessionStartedAt` from `useRefinementSession()` and the ticket cache from `useTickets("__all__")`. Total points = `sessionEstimates[key] ?? ticket.storyPoints` (same rule as `SessionEndModal`). Duration from `sessionStartedAt`, computed once on mount, omitted when null. Inline reduced-motion check via `matchMedia`; when reduced, render zero cannon pieces. All ambience layers `pointer-events-none`.
3. **Wire into the session page** — in the `showingEndModal` branch of `src/app/(app)/refinement/[sessionId]/session/[ticketKey]/page.tsx`, wrap `<SessionEndModal />` in `<SessionWrapUpCelebration>` and add `relative overflow-hidden` to the container. Re-arrival remounts the branch, so the one-shot cannons replay naturally. `SessionEndModal` itself untouched.
4. **Tests `SessionWrapUpCelebration.test.tsx`** — mock context + ticket hook (pattern from `SessionEndModal.test.tsx`), stub `window.matchMedia` per test. Cases: headline with correct numbers (incl. sessionEstimates precedence), duration omitted when `sessionStartedAt` null, 40 confetti pieces with motion, zero pieces under reduced motion (halo/headline still present).
5. **Validation** — `npm run lint`, `npm run typecheck`, full test suite, `npm run build`.

Notes: the exploration hub already marks variant J as chosen, so no hub change is needed. The dev exploration page stays untouched as reference.

## Acceptance criteria

- [x] Arriving at the wrap-up screen (end modal opens in the fullscreen session view) shows the aurora field, breathing halo, and "Queue cleared" headline around the existing `SessionEndModal`.
- [x] The corner cannons fire once per arrival at the wrap-up; going Back to Session and wrapping up again fires them again.
- [x] The headline subline shows real data: queue length, total story points (session estimates take precedence over the ticket cache, same rule as the modal rows), and session duration derived from `sessionStartedAt`. Duration is omitted gracefully when `sessionStartedAt` is null (e.g. resumed sessions after a reload).
- [x] `SessionEndModal` itself is visually and functionally unchanged (header, ticket rows, notes, comment field, Back to Session / Save / Complete).
- [x] All colors come from theme tokens or the fixed confetti palette; both light and dark theme look correct.
- [x] `prefers-reduced-motion: reduce` disables the cannons and the breathing loop (static halo/headline are fine).
- [x] Confetti and ambience layers are `pointer-events: none` and never block interaction with the modal.
- [x] No hydration warnings: any pseudo-random particle values are deterministic and precision-rounded (see exploration page for the `seededRand` + `toFixed` approach that fixed this).
- [x] Tests cover the celebration component: renders headline with correct numbers, omits duration without a start time, renders the expected particle count, respects reduced motion.
- [x] `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` all pass.

## Implementation notes

- Render location: the wrap-up renders fullscreen in `src/app/(app)/refinement/[sessionId]/session/[ticketKey]/page.tsx` (`showingEndModal` branch, a full-height wrapper around `<SessionEndModal />`). The celebration layers belong in that wrapper (or a new `SessionWrapUpCelebration` component around the modal), not inside `SessionEndModal`.
- Reference implementation: `src/app/dev/exploration/session-ending/page.tsx` — `AuroraField`, `AmbientHalo`, `QueueClearedHeadline`, `CannonSide`, and the `seConfettiFall`/`seCannonShot`/`seBreath` keyframes. Port these into a real component with proper keyframes in `globals.css` (or a co-located CSS module); do not import from the dev page.
- Data: `useRefinementSession()` provides `queue`, `sessionEstimates`, `sessionStartedAt`. Total points = per-ticket `sessionEstimates[key] ?? ticket.storyPoints`, matching `SessionEndModal`'s `ticketRows` logic.
- The exploration page stays as-is for reference; mark variant J as chosen on the hub.

## Out of scope

- Any change to what Save / Complete do (BRDG follow-up if ever needed).
- A Complete-press finale (exploration variants A–E, e.g. toast on landing or in-modal summary). Possible follow-up story; composes cleanly with this one.
- Streaks or cross-session stats ("3rd session this week").
