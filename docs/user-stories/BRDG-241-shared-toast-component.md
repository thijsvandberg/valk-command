# BRDG-241: Shared Toast Component and Hook

**Status:** Not Started
**Priority:** Low
**Type:** Tech Debt / Refactor

## Description

As a developer, I want a single reusable toast (notification) component and hook, so that every view shows consistent transient feedback and we stop maintaining four near-identical copies of the same toast logic.

Today there is no shared toast primitive. Several views each declare their own local `toast` state plus a `showToast` callback with the same shape (a `setTimeout` auto-dismiss, a `role="status"` floating element with `fadeInUp`), and they have drifted: only the Sprint Board variant supports a persistent (non-auto-dismiss) toast with a dismiss button and rich content with a link (added for the move-to-sprint feedback). The others still auto-dismiss plain strings.

The activity/sync toast system (`ActivityContext` + `SyncToast`) is intentionally separate (it has retry/acknowledge semantics tied to sync state) and is **out of scope**.

## Current ad-hoc implementations

- `src/components/sprint-board/SprintBoard.tsx` (local `toast` state; now supports persistent toast + dismiss + link via `showToast(node, 0)`)
- `src/components/sprint-board/MultiSprintView.tsx`
- `src/components/chat/ChatLayout.tsx`
- `src/components/refinement-session/RefinementPageContent.tsx`
- `src/components/sprint-board/ExportToasts.tsx` (presentational, leans on a passed-in `showToast`)

## Requirements

### 1. Shared hook

- Add `src/hooks/useToast.ts` exposing `{ toast, showToast, dismissToast }`.
- `showToast(message: React.ReactNode, durationMs = 3000)`: `durationMs <= 0` keeps the toast until dismissed.
- `dismissToast()`: clears any timer and hides the toast.
- Clean up the timer on unmount.

### 2. Shared component

- Add `src/components/ui/Toast.tsx` rendering the floating toast (`role="status"`, `fadeInUp`, layered shadow, brand-tinted check icon) with an always-present dismiss (X) button.
- Accepts `React.ReactNode` content so callers can pass rich content (links, etc.).
- Keep the existing visual style (do not restyle); this is consolidation, not a redesign.

### 3. Migrate the ad-hoc views

- Replace the local toast state in the four views above with the shared hook + component.
- Preserve current behaviour, including the Sprint Board persistent move-to-sprint toast with the "View on sprint board" link.
- `ExportToasts` keeps working with the shared `showToast`.

## Out of scope

- The activity/sync toast system (`ActivityContext`, `SyncToast`) and `TaskCompletionNotifier` (API-polling notifications).
- Any change to toast copy, timing, or visual design beyond unifying what already exists.
- A global toast provider/portal (single-toast-per-view behaviour is fine for now).

## Technical notes

- The Sprint Board version is the most complete reference for the persistent + dismiss + rich-content behaviour (`showToast`/`dismissToast` and the toast render block in `SprintBoard.tsx`).
- `ExportToasts.tsx` already shows the dismiss-button styling pattern to reuse in the shared component.

## Checklist

- [ ] Add `useToast` hook (persistent support + dismiss + unmount cleanup)
- [ ] Add shared `Toast` component (rich content + dismiss button, existing style)
- [ ] Migrate `SprintBoard` to the shared hook/component (keep move-to-sprint link toast)
- [ ] Migrate `MultiSprintView`
- [ ] Migrate `ChatLayout`
- [ ] Migrate `RefinementPageContent`
- [ ] Verify `ExportToasts` still works with the shared `showToast`
- [ ] Add tests for `useToast` and `Toast`
- [ ] Verify no behavioural regressions across the migrated views
