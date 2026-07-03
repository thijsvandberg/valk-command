# BRDG-462: Inbox digest — snooze for an hour instead of minimize

**Status:** To Do
**Priority:** Medium
**Type:** Feature

## Description

The inbox daily-digest banner (bottom-left, BRDG-413) currently has a **minimize**
button that collapses it into a small bubble in the corner. The bubble is a purely
client-side (localStorage) UI preference and sticks around until you re-open it.

Replace minimize with a **snooze**: one click hides the banner completely and it comes
back on its own after an hour ("not a good moment right now"). This gives the banner a
clean three-way set of actions:

- **Open inbox** — review now
- **Snooze** — come back in an hour (new)
- **Dismiss** — done for the rest of the day (unchanged)

Snooze differs from Dismiss: Dismiss preserves the spent delivery slot so the banner is
gone until the next window/day, while Snooze reliably resurfaces the same digest an hour
later.

## Current Behaviour

- `src/components/notifications/InboxDigestBanner.tsx` renders the banner globally (mounted
  in `src/app/(app)/layout.tsx`) by polling `GET /api/inbox/digest` every 60s.
  - The header has a `Minus` "Minimize" button (lines ~149-156) whose `minimize` handler
    (lines ~56-60) writes the active digest id to `localStorage` under
    `inbox-digest-collapsed-id` (`COLLAPSE_KEY`, lines ~13-33) and flips `collapsedId`.
  - `isCollapsed` (line ~54) is derived from that id; when true the whole banner renders
    as a small bubble (`if (isCollapsed)` branch, lines ~94-113) with an `expand` handler
    that clears the localStorage key.
  - `clear()` (lines ~69-76) optimistically hides then calls `DELETE /api/inbox/digest`
    (dismiss); used by both Open inbox and Dismiss.
- `src/lib/inbox-digest-store.ts` owns the server-backed state:
  - `InboxDigestState = { active, deliveryDate, deliveredWindows }` (lines ~32-38).
  - `evaluateInboxDigest(ctx, now)` (lines ~69-122) is the lazy-cron: day rollover reset,
    weekend short-circuit, window delivery, and returns `state.active`.
  - `clearActiveDigest(userId)` (lines ~128-132) nulls `active`, preserving
    `deliveredWindows` (the spent slot is not refilled).
- `src/app/api/inbox/digest/route.ts`: `GET` evaluates and returns `{ active }`;
  `DELETE` dismisses.
- `src/lib/api-client.ts` (`inboxDigest`, lines ~1056-1063): `url()`, `get()`, `dismiss()`.
- There is a precedent for time-based suppression: `src/lib/cleanup-disposition.ts` stores
  an ISO `dispositionUntil` timestamp checked server-side. Snooze reuses the same shape.

## Proposed Approach

Snooze must be **server-backed** (unlike the current localStorage minimize) because banner
visibility is decided server-side in `evaluateInboxDigest`; a client-only hide would
re-appear on reload or in a second tab. Store a self-expiring ISO timestamp on the
per-user digest state.

### Server (`inbox-digest-store.ts`)

- Extend `InboxDigestState` with `snoozedUntil: string | null` (ISO). `emptyState` sets it
  to `null`. Reads of older stored state (no field) treat it as absent — backward safe.
- Add `SNOOZE_DURATION_MINUTES = 60` and a `snoozeActiveDigest(userId, now, minutes?)`:
  read state; no-op when there is no `active`; otherwise write
  `snoozedUntil = now + minutes` while preserving `active` and `deliveredWindows`.
- In `evaluateInboxDigest`, after the day-rollover reset and before the weekend/window
  logic: if `snoozedUntil` is set and `now` is still before it, persist any pending
  bookkeeping and return `null` (banner hidden); if `now` is at/after it, clear
  `snoozedUntil` (and mark changed) and fall through to normal evaluation so the digest
  resurfaces. A 60-minute snooze cannot span from one delivery window to the next
  (~5h apart), so it never suppresses a genuinely new later window.

### API (`route.ts` + `api-client.ts`)

- Add `POST /api/inbox/digest` → `applyRateLimit("write")`, resolve user, call
  `snoozeActiveDigest(userId, new Date())`, return `{ ok: true }`.
- Add `inboxDigest.snooze()` posting to the same URL.

### UI (`InboxDigestBanner.tsx`)

- Remove the collapse machinery entirely (the `COLLAPSE_KEY` constant,
  `readCollapsedId`/`writeCollapsedId`, `collapsedId` state, `isCollapsed`, `minimize`,
  `expand`, and the whole `if (isCollapsed)` bubble render branch). "Snooze instead of
  minimize" means the corner bubble goes away.
- Replace the header `Minus` button with an `AlarmClock` icon button (same styling/slot),
  `aria-label` + `title` "Snooze for 1 hour". Its handler optimistically hides
  (`mutate({ active: null }, { revalidate: false })`) then calls `inboxDigest.snooze()`
  best-effort; the 60s poll reconciles (stays hidden while snoozed, returns after an hour).
- `AlarmClock` is already used elsewhere in the codebase; swap the `Minus` import for it.

### Docs

- `docs/architecture/api-routes.md`: add the `POST /api/inbox/digest` (snooze) row next to
  the existing GET/DELETE rows.

### Out of scope

- The digest computation, delivery windows, weekend rule, and per-day cap — unchanged.
- Dismiss / Open inbox behaviour — unchanged.
- Making the snooze duration configurable — fixed at 1 hour.

## Implementation Plan

1. **Store**: add `snoozedUntil` to `InboxDigestState` + `emptyState`; add
   `SNOOZE_DURATION_MINUTES` and `snoozeActiveDigest`; add the snooze check in
   `evaluateInboxDigest` (suppress-while-active, clear-on-expiry).
2. **Route + client**: add `POST` handler; add `inboxDigest.snooze()`.
3. **Banner**: strip collapse/bubble logic; add the `AlarmClock` snooze button + handler.
4. **Docs**: `api-routes.md` POST row.
5. **Tests**: extend `inbox-digest-store.test.ts` and `route.test.ts`; add
   `InboxDigestBanner.test.tsx`.
6. **Verify**: `npm run lint`, `npm run typecheck`, `npx vitest run` (changed files),
   `npm run build`.

## Acceptance Criteria

- [x] The digest banner no longer minimizes into a corner bubble; the localStorage collapse preference and bubble render branch are gone. <!-- InboxDigestBanner.tsx: COLLAPSE_KEY/read/write/collapsedId/isCollapsed/minimize/expand + bubble branch removed -->
- [x] The banner header shows an alarm-clock "Snooze" button (aria-label/title "Snooze for 1 hour") in place of the old minimize button. <!-- InboxDigestBanner.tsx: AlarmClock button -->
- [x] Clicking Snooze hides the banner immediately and it does NOT reappear on reload or focus while snoozed. <!-- optimistic mutate({active:null}) + server snoozedUntil makes GET return null -->
- [x] After roughly an hour the same digest reappears on its own (unless meanwhile dismissed/opened). <!-- evaluateInboxDigest clears snoozedUntil on expiry and returns active -->
- [x] Snooze does not consume a delivery window or the per-day cap. <!-- snoozeActiveDigest leaves deliveredWindows intact -->
- [x] Dismiss and Open inbox behave exactly as before. <!-- clearActiveDigest untouched -->
- [x] `docs/architecture/api-routes.md` documents `POST /api/inbox/digest` (snooze). <!-- api-routes.md POST row added -->

## Tests

- [x] `snoozeActiveDigest` sets `snoozedUntil` one hour ahead and preserves `active` + `deliveredWindows`; no-op when there is no active digest. <!-- inbox-digest-store.test.ts, "snooze (BRDG-462)" describe -->
- [x] `evaluateInboxDigest` returns `null` while snoozed and returns the same active digest (clearing `snoozedUntil`) once the snooze has passed, without computing a fresh digest. <!-- inbox-digest-store.test.ts -->
- [x] `POST /api/inbox/digest` snoozes an active digest so a subsequent GET returns `null`, and the digest resurfaces after the snooze window elapses. <!-- route.test.ts -->
- [x] The banner renders a Snooze button that calls `inboxDigest.snooze()` and hides the banner; no minimize bubble is rendered. <!-- InboxDigestBanner.test.tsx -->

## Status update

Implemented on branch `dev`. Lint clean, all 27 tests across the three suites pass, and the
touched files are typecheck-clean. A full `npm run build` was intentionally skipped: the shared
working tree carries unrelated untracked parallel work (`src/components/sprint-board/TestDocMarker.tsx`,
imported by `BoardRow.tsx`) with a pre-existing typecheck error, which would dominate the build.
Run the build once that parallel work settles or in a clean worktree before promoting.

**Post-ship round (2026-07-03):** clicking Snooze now shows a short "Snoozed for 1 hour"
confirmation toast (shared `useToast` + `Toast`, bottom-right, auto-hides after 3s). The toast
renders outside the banner's `if (!active)` branch because the optimistic mutate unmounts the
banner section on the same click. Covered by a fake-timers test in `InboxDigestBanner.test.tsx`.

## Related

- [[BRDG-413-inbox-new-ticket-digest]] — the digest banner this modifies.
- `src/lib/cleanup-disposition.ts` — the `dispositionUntil` time-based-suppression pattern reused here.
- `docs/architecture/api-routes.md` — digest route reference.
