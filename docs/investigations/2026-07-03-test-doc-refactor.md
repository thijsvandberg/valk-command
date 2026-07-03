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

- [ ] Invoke `frontend-design` skill FIRST.
- [ ] **E. Shared caption-button** primitive (or `Button variant="ghost"
  size="sm"` where it fits) for version chips, Compare, Edit/Preview, "Use this
  one", per-block Edit — consistent hover/focus-visible/active + cursor-pointer.
- [ ] **F. Reuse `Tag`** for needs-input / draft-ready / "N ready" queue chips.
- [ ] Consistent typography + spacing tokens between the two modals (header,
  body padding, section gaps, alert stack).
- [ ] Visual hierarchy inside the review modal: alerts vs toolbar vs editor
  (alerts currently stack up to 5 deep with equal weight).
- [ ] Bundle modal section rhythm: missing / documented blocks / Misc /
  notNeeded / other — clearer grouping and headers.
- [ ] Empty + loading states: reuse `EmptyState` / `LoadingState` / `Skeleton`
  where the modal currently hand-rolls a centered spinner / bare paragraph.
- [ ] Verify PO hard constraints: NO focus ring/glow on the editor textarea
  (currently a brand-tinted border only — already compliant; keep it), no
  default Tailwind blue/indigo, no `transition-all`, every clickable has
  hover/focus-visible/active + cursor-pointer.
- [ ] Check light AND dark themes.
- [ ] Update `data-testid`s + tests together with any markup move.
- [ ] Full DoD green + E2E walk.

## Blocked / deferred

- **Pre-existing baseline failure, NOT mine, NOT in scope:**
  `src/app/routes.test.tsx` › "manifest covers all page.tsx files" fails because
  `src/app/virtual-repro/page.tsx` (a throwaway public repro page left over from
  the recent BRDG-452 prod-virtualizer debugging) is neither under `/dev/` nor in
  the route manifest. Present at clean `dev` HEAD before any change here. It is
  unrelated parallel work; the hard rules forbid touching it. Phase gating for
  this refactor is therefore "no NEW failures + the whole test-doc surface green"
  (7582/7583 at baseline). Flag for the PO to clean up `virtual-repro/`.

## Results

_(filled in when all phases are done)_
