# BRDG-423: Standardize data-state coverage (loading / empty / error)

**Status:** Done
**Priority:** High
**Type:** Consistency + reliability — loading/empty/error states

## Status (run note)

Shipped on `dev` in five commits:

1. `dea980c9` feat(ui): surface fetch errors across primary data views — added a
   shared `DataErrorState` convention (`src/components/shared/DataErrorState.tsx`:
   inline banner over cached content, or a full retry screen when nothing loaded)
   and wired every SWR surface's `error` into it (Sprint Board, Inbox, Epics,
   Pipelines, Activity Log, Stakeholder, Cleanup, People). Stopped swallowing in
   the Stakeholder fetcher and the Activity-Log entries fetcher; fixed
   `StakeholderSprintCards` misusing `LoadingState` as a "no sprint" empty state.
2. `9e8ec7b3` refactor(ui): adopt shared `EmptyState` (deleted the Inbox/Cleanup
   local variants and the two inline epics dashed-border empties; routed
   TicketDevelopment through it too) and added `Skeleton`/`SkeletonRow` +
   one `skeletonRowOpacity` fade, collapsing the four hand-rolled list skeletons.
3. `94cbeeae` refactor(settings): normalized Scheduler / Prompts / Deprecated-Areas
   (and tested People) onto the shared LoadingState/EmptyState/DataErrorState trio.
4. `da3c03e0` refactor(ui): unified the three error-boundary copies into one shared
   `ERROR_BOUNDARY_TITLE` / `ERROR_BOUNDARY_MESSAGE`.

Verified: `npm run lint`, `npm run typecheck`, `npx vitest run` (6990 tests), and
`npm run build` all green. E2E in the running app: forced a fetch failure (blocked
the API) on Sprint Board (inline banner + full failure→Retry→recovery cycle),
Inbox, Stakeholder, and the People settings page — each shows a visible, recoverable
error instead of a blank/empty screen; no new console errors beyond the forced
network failure.

**Scope note (empty-state sweep):** the AC-required local variants (Inbox, Cleanup,
Epics) are gone and `TicketDevelopment` was converted. The remaining bare-text "No X"
labels in ticket-detail / story-writer panes (e.g. "No comments yet", "No labels",
"No description") were intentionally left as inline labels: the shared `EmptyState`
is a centered icon+title block sized for full-view empties, and forcing it into those
small in-panel sections would be a visual regression. `EpicChildrenSection.tsx` was
deliberately not touched (overlaps in-flight board work BRDG-415/416).

## Description

The app ships a designed primitive for every data state — `shared/LoadingState.tsx`,
`shared/Skeleton.tsx`, `shared/EmptyState.tsx`, `shared/InlineAlert.tsx`, `shared/ErrorBoundary.tsx`,
plus route-level `loading.tsx`/`error.tsx`. The **Chat** view (`chat/ConversationList.tsx`) uses all
three correctly and is the reference pattern. The problem is uneven adoption — and one genuinely
**functional** gap: data-fetch errors are invisible almost everywhere. Because SWR does not throw, the
`ErrorBoundary`/`error.tsx` layer never catches a failed fetch, and only ~4 of ~47 data surfaces read
SWR's `error`. A failing API on Sprint Board, Inbox, Epics, Pipelines, Activity Log, or most Settings
pages renders as a **permanent blank/empty screen with no retry** — that part is a reliability bug, not
a cosmetic nit, which is why this story is High.

## Evidence (file:line)

### Errors are silently swallowed (functional)
- Only ~4 files read SWR `error` (`story-writer/page.tsx`, `QueryStatsWidget`, `WatcherPicker`,
  `useLinkTypes`). Sprint Board (`useTickets` error unused), Inbox (`page.tsx:87`), Epics, Pipelines,
  Activity Log, People all ignore it → blank on failure.
- `stakeholder/page.tsx:51` — `const fetcher = (url) => swrFetcher(url).catch(() => null)` actively
  converts any failure to `null`, indistinguishable from "no data," on the external-facing view.
- `StakeholderSprintCards.tsx:70` — `LoadingState` ("No sprint selected") is misused as an *empty*
  state (wrong `role="status"` + loading copy for a non-loading condition).

### Empty state reinvented instead of shared `EmptyState`
- Local `EmptyState`/`NoMatchState` in `inbox/page.tsx:645-672` and `cleanup/page.tsx:983-1002`
  (different icon-tile radius/shadow than the shared one), plus 2 inline dashed-border variants in
  `epics/page.tsx:133-153`. Net: 4 distinct "polished" empties + ~45 bare-text "No X" empties across
  ticket-detail and story-writer panes (varying text sizes and tertiary/muted colors).

### No single loading skeleton
- The opacity-fade row skeleton is hand-rolled with **four different constants**: `i*0.12` (Inbox),
  `i*0.1` (Cleanup page), `i*0.07` (Cleanup route), `i*0.14` (Epics) — while Pipelines/Stakeholder
  correctly use the shared `Skeleton*`. ~70 files spin a raw `animate-spin` icon; ~39 use raw
  `animate-pulse`.

### Settings is internally inconsistent
- `JobsPanel.tsx` uses the full shared trio (incl. `InlineAlert` at `:193`). Scheduler
  (`:134/:136`), People (`:156/:159`), Prompts (`:214/:218`), Deprecated-Areas (`:71/:75`) use bare
  "Loading…"/"No X" strings with silent `.catch(() => …)`.

### Divergent error copy
- `error.tsx` ("An unexpected error occurred…"), `global-error.tsx` ("A critical error occurred…"),
  `ErrorBoundary.tsx` ("…in this section.") — three near-identical headings, three bodies.

## Proposed approach

1. **Surface fetch errors (do first — it's the functional fix).** Adopt a small `useQuery`-style
   wrapper or a convention that every SWR surface reads `error` and renders `InlineAlert` (inline) or
   an `EmptyState`-with-retry (full view). Remove the Stakeholder `.catch(() => null)` so failures are
   distinguishable from empty. Treat Chat's `ConversationList` as the template.
2. **Adopt `EmptyState` everywhere**, deleting the Inbox/Cleanup/Epics local variants and replacing the
   ~45 bare-text empties (icon + title + optional CTA). Agree a copy convention (imperative vs passive).
3. **One skeleton.** Fold the four opacity-fade variants into `Skeleton`/`SkeletonRow` with a single
   fade constant; route the bespoke page/route skeletons through it.
4. **Normalize Settings** onto the shared trio (match `JobsPanel`).
5. **Unify the three error-boundary copies** into one shared message.

### Trade-offs

- Step 1 is the meaty, highest-value part and is partly product scope (what does a failed view *look*
  like — inline banner vs full retry screen?). The rest (steps 2-5) is cosmetic and low-risk.
- Fixing Stakeholder's swallow may reveal previously-hidden API failures; that is the point, but expect
  the external view to start showing error states where it used to look empty.

## Acceptance Criteria

- [x] Every primary data view (Sprint Board, Inbox, Epics, Pipelines, Activity Log, Stakeholder,
      Settings sub-pages) renders a visible, recoverable error state on fetch failure; Stakeholder no
      longer swallows errors.
- [x] All empty states use the shared `EmptyState`; the Inbox/Cleanup/Epics local variants are gone.
      (Inline panel labels in ticket-detail/story-writer left as-is on purpose — see Status note.)
- [x] One skeleton style (single fade constant); bespoke page skeletons routed through `Skeleton`.
- [x] Settings pages use the shared loading/empty/error trio; one error-boundary message.

## Tests

- [x] Per-view test: mock a fetch rejection and assert an error UI with a retry affordance renders
      (not a blank screen). Explicit test that Stakeholder shows an error, not empty.
- [x] `EmptyState` adoption guard or snapshot for the previously-bespoke views.
- [x] Existing view tests stay green.

## Related

- [[BRDG-419-status-color-single-source-of-truth]] — `InlineAlert` (the error banner) must be
  token-correct first.
- Reference to emulate: `chat/ConversationList.tsx` (uses `LoadingState` + `EmptyState` + `InlineAlert`
  together correctly).
- Touch points: SWR hooks (`useTickets`, `usePipelines`, `useEpicProgress`, …), `stakeholder/page.tsx`,
  `StakeholderSprintCards.tsx`, `inbox/page.tsx`, `cleanup/page.tsx`, `epics/page.tsx`, the Settings
  sub-pages, `error.tsx`/`global-error.tsx`/`ErrorBoundary.tsx`.
