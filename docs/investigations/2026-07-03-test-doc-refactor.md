# Test-doc feature refactor — audit + plan (2026-07-03)

End-to-end refactor of the stakeholder test-documentation feature (BRDG-426 +
BRDG-461). The feature works and is well tested (~65 co-located tests); it grew
through ~20 rapid PO-feedback iterations in one day, so structure, dedup and
component reuse lag behind the behaviour. This document is the audit and the
progress tracker for phases 2 (code refactor, no visual change) and 3
(design/UX component reuse, visual change allowed).

**Behaviour is frozen.** Every invariant in
`docs/architecture/workspace-integration.md` (§ Stakeholder test documentation)
must still hold; the feature tests prove most of them. Phase 2 changes structure
only; phase 3 changes presentation only, never the interaction flow.

## Baseline (before) line counts

| File | Lines |
|------|------|
| `TestDocReviewModal.tsx` | 781 |
| `SprintTestDocsModal.tsx` | 331 |
| `TestDocStoryPane.tsx` | 66 |
| `TestDocMarker.tsx` | 73 |
| `useTestDocBoard.ts` | 156 |
| `lib/test-doc.ts` | 42 |
| `lib/parse-test-doc.ts` | 61 |
| `lib/test-doc-background.ts` | 84 |
| `lib/test-doc-prefetch.ts` | 44 |
| `generate-test-doc/route.ts` | 119 |
| `test-doc/route.ts` | 219 |
| `test-doc-draft/route.ts` | 60 |
| `sprints/[id]/test-docs/route.ts` | 131 |

Tests: `TestDocReviewModal.test.tsx` 29, `SprintTestDocsModal.test.tsx` 13,
`TestDocMarker.test.tsx` 3, `test-doc.test.ts` 9, `parse-test-doc.test.ts` 7,
`test-doc-background.test.ts` 4; routes: `test-doc` 15, `generate-test-doc` 5,
`test-doc-draft` 3, `sprints/.../test-docs` 5; plus the `StatusChangeLine`
BRDG-426 block. `test-doc-prefetch.ts` has **no** co-located test.

---

## Findings

### A. Oversized component — `TestDocReviewModal.tsx` (781 lines)
One file holds: the entry/version state model, the cache-lookup effect, the
concurrency scheduler, the SSE watcher, save/not-needed/regenerate/switch/advance
handlers, the pane-split drag logic, AND the full JSX for header + left pane
(alerts, toolbar, chips, compare, editor, preview) + story pane host + footer.
The state machine and the left pane are independently testable units buried in
one render function.

### B. Modal-header duplication (3 near-identical blocks)
`TestDocReviewModal`, `SprintTestDocsModal` and `AddSubtasksModal` each hand-roll
the exact same header: `border-b border-border-subtle px-5 py-4` row, an
`h-9 w-9 rounded-xl bg-[var(--color-brand-500)]/12 ring-1 ...` icon badge, a
title + subtitle stack, and a ghost icon-only close `Button`. Verified: this
exact icon-badge string appears in **only** these 3 files.
`StoryWriterLauncherModal` uses a close variant (`h-8 w-8 rounded-lg`, no
`border-b`). `PanelHeader` is a different concept (uppercase small-panel label),
not this. A shared `ModalHeader` pays off.

### C. Duplicated `testDocState` derivation (must stay in sync)
The exact same 5-line ternary deriving `"accepted" | "draft" | "not_needed" |
null` from `meta.testDoc / testDocDraft / testDocClassification` lives in
`api/tickets/route.ts:150` and `lib/ticket-detail-builder.ts:159`. Two copies of
one rule = drift risk.

### D. Route-level duplication across the 3 write routes
`generate-test-doc` POST, `test-doc` PUT and `test-doc-draft` PUT each do
`resolveDraftKey` → `isDraftKey` → 409 (with a per-route message). The
ticket-exists → 404 check is repeated in the `test-doc` notNeeded branch, the
`test-doc` main branch and `test-doc-draft`. Note: the GET and the two PUTs call
`validatePathParam` first; the generate POST does **not** — preserve that
difference (adding validation there is a behaviour change, out of scope).

### E. Caption/toolbar-button style duplicated ~6×
The string `cursor-pointer rounded-md px-2 py-0.5 text-caption font-medium ...
hover:bg-overlay-default hover:text-text-secondary focus-visible:outline-2 ...`
is hand-repeated for: version chips, Compare toggle, Edit/Preview toggle, "Use
this one" (review modal) and the per-block Edit buttons (bundle modal). One
shared caption-button.

### F. Hand-rolled badges shadow the `Tag` primitive
The "needs input" and "draft ready" pills in `SprintTestDocsModal`
(`rounded bg-[var(--color-status-warning-subtle)] ... text-[var(--color-status-warning)]`)
are exactly `Tag color="amber"`. The queue "N ready" chip in the review modal is
a hand-rolled pill too.

### G. Dead code
`extractTestDocBlock` in `lib/test-doc.ts` is exported and unit-tested but has
**zero** app call sites (grep confirms). Its sibling `stripTestDocBlock` /
`appendTestDocBlock` are used. Remove the dead function + its test.

### H. Missing test
`lib/test-doc-prefetch.ts` (TTL cache, prime/get/invalidate) has no co-located
test. Add one.

### I. Well-factored — leave alone
`useTestDocBoard.ts` (BRDG-426 refactor #7) already consolidates the board
wiring cleanly; `coerceClassification` already dedups classification parsing;
`parse-test-doc.ts`, `test-doc-background.ts`, `TestDocMarker.tsx` (plain button
is a deliberate PO decision), `TestDocStoryPane.tsx` are appropriately sized.
The client-side background poll in `useTestDocBoard` duplicating the server-side
capture window is intentional (client toast vs server persist), not dead code.

---

## Phase 2 checklist — code refactor, NO visual change

- [x] **B. Shared `ModalHeader`** — `src/components/shared/ModalHeader.tsx`
  reproduces the h-9/rounded-xl/border-b variant; adopted in
  `TestDocReviewModal`, `SprintTestDocsModal`, `AddSubtasksModal` (+ co-located
  test). `StoryWriterLauncherModal` left as-is (different h-8/rounded-lg variant).
- [x] **C. Shared `deriveTestDocState`** in `lib/test-doc.ts`, called from
  `api/tickets/route.ts` and `ticket-detail-builder.ts`. Unit tested.
- [x] **A1. `useTestDocReview` hook** — entries/index/progress/scheduler + all
  handlers moved to `src/components/sprint-board/useTestDocReview.ts`; the
  component consumes it. Modal tests pass unchanged (29/29).
- [x] **A2. `TestDocReviewPane.tsx`** — alerts + toolbar + chips + compare +
  editor + preview extracted; every `data-testid` preserved.
- [x] **A3. `usePersistedSplit` hook** — pane-split drag + localStorage
  persistence; co-located test.
- [x] **D. Route helper** — `guardTestDocDraftKey(key, verb)` in
  `lib/test-doc-routes.ts` dedups the 3 write routes' 409 guard (same status +
  message template). `ticketExists` helper SKIPPED on purpose: that 404 check is
  the codebase-wide `db.select(...).get()` idiom (extracting a test-doc-only copy
  would fragment it), one of the 3 sites needs the row's `description` anyway, and
  the generate route deliberately skips `validatePathParam`.
- [x] **G. Removed dead `extractTestDocBlock`** + its test.
- [x] **H. Added `test-doc-prefetch.test.ts`** (prime/get/TTL/invalidate/failure).
- [x] Swept for stale comments/TODOs — none found in the surface.
- [x] Full DoD green: lint, typecheck (after build regenerated `.next-build`),
  `vitest run` 7600/7600, `npm run build`.
- [x] E2E walk (Chrome, dev :3101, sprint BT: 140): all four marker states render
  (accepted/draft/none/not_needed → `deriveTestDocState`); marker click opens the
  review modal in VIEW mode without generating; Edit toggle switches to the raw
  editor; Display "Test documentation" field toggles markers off/on; sprint "..."
  → Test documentation opens the bundle (new `ModalHeader`, missing overview,
  documented blocks); per-block Edit opens the review modal with "Back to sprint
  doc" and returns to the refreshed bundle. Zero console errors throughout.

`TestDocReviewModal.tsx`: 781 → 234 lines (hook 467, pane 203, split 52).

## Phase 3 checklist — design/UX, visual change allowed

- [x] Invoked `frontend-design` skill first. Direction: precision alignment to
  the existing Bridge design system (token-only, restraint), NOT a new look.
- [x] **E. Shared `CaptionButton`** (`src/components/sprint-board/CaptionButton.tsx`)
  with `ghost`/`chip` variants + `active` state; adds a transform-based pressed
  state (`active:scale-[0.97]`, matching the `Button` primitive) that the
  hand-rolled buttons lacked. Adopted for the version chips + Compare/Edit
  toggles (review pane) and the bundle's two per-block Edit buttons. "Use this
  one" kept as its distinct brand-text link (given an active state inline).
- [x] **F. Reuse `Tag`** (`color="amber"`) for the needs-input and draft-ready
  badges in the bundle. The "N ready" queue counter stays part of the mono
  position chip (converting it to a Tag would break that chip's styling).
- [x] Empty + loading states in the bundle now reuse `EmptyState`
  (icon + title) and `LoadingState variant="spinner"` instead of a bare
  paragraph / raw `Loader2`.
- [x] PO hard constraints verified: editor textarea keeps a brand-tinted border
  only (no ring/glow); zero default Tailwind blue/indigo; no `transition-all`;
  every clickable now has hover + focus-visible + active + cursor-pointer.
- [x] Light theme confirmed in Chrome; dark theme safe by construction — every
  phase-3 file is token-only (grep-verified: no hex, no `bg-white/black`, no
  default palette), and `Tag`/`EmptyState`/`LoadingState` are already used
  app-wide in both themes.
- [x] `data-testid`s preserved; tests assert by text so all pass unchanged; added
  `CaptionButton.test.tsx`.
- [x] Full DoD green (lint, typecheck, 7604 tests, build) + E2E walk (bundle
  renders Tag "draft ready" + CaptionButton Edit; capacity-meter toggle I
  flipped by accident restored; zero console errors).

Deliberately NOT changed in phase 3 (interaction model / already-good design):
the review modal's alert stack order and the bundle section order (missing →
documented → Misc → notNeeded → other) are the shipped, PO-approved information
hierarchy — re-ordering would be a behaviour/UX change, out of a
presentation-only phase. `TestDocMarker` stays a plain button (deliberate PO
decision). The `TicketMetaContent` "Test doc" DetailRow value keeps its inline
style to match its sibling rows.

## Results

Refactored the shipped stakeholder test-doc feature (BRDG-426 + BRDG-461)
end-to-end in three phases, behaviour-preserving, on `dev`.

**New shared/extracted units:** `ModalHeader` (57), `useTestDocReview` (467),
`TestDocReviewPane` (192), `usePersistedSplit` (52), `CaptionButton` (49),
`deriveTestDocState` (in `test-doc.ts`), `guardTestDocDraftKey`
(`test-doc-routes.ts`, 17). Each with co-located tests.

**Before → after line counts (main files):**

| File | Before | After |
|------|-------:|------:|
| `TestDocReviewModal.tsx` | 781 | 234 |
| `SprintTestDocsModal.tsx` | 331 | 313 |
| `lib/test-doc.ts` | 42 | 55 (added `deriveTestDocState`, dropped dead `extractTestDocBlock`) |

The 781-line modal is now 234 lines of layout/wiring over a 467-line controller
hook + a 192-line presentational pane + a 52-line split hook. Three hand-rolled
modal headers collapsed to one `ModalHeader`; six hand-rolled caption buttons to
one `CaptionButton`; two amber badges to `Tag`; two duplicated `testDocState`
derivations to one helper; three route draft-key guards to one helper.

**Kept deliberately:** the whole interaction model (queue, prefetch, versions,
save path, view mode, background generation, per-sprint marker visibility) — all
invariants hold, proven by the unchanged ~65 feature tests. `useTestDocBoard`,
`parse-test-doc`, `test-doc-background`, `TestDocMarker`, `TestDocStoryPane` were
already well-factored and left alone. The `ticketExists` 404 dedup was skipped on
purpose (codebase-wide idiom; would fragment).

**Test suite:** 7583 → 7604 (net +21 new tests across the refactor; no coverage
removed).

## Blocked / deferred

- **Nothing blocked at completion.** At baseline one unrelated test failed
  (`routes.test.tsx` flagged a leftover `src/app/virtual-repro/page.tsx` from the
  BRDG-452 prod-virtualizer debugging). A parallel session removed that page
  mid-run, so the full suite is now green (7604/7604). No item in this refactor
  was blocked.

## Results

_(filled in when all phases are done)_
