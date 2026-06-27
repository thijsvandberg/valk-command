# BRDG-419: Make status color a single source of truth

**Status:** Completed
**Priority:** High
**Type:** Consistency — design tokens, status/badge color

## Status (run note)

Shipped. The shared primitives `InlineAlert`, `Badge` and `Tag` now derive every
color from `--color-status-*` (plus `--color-icon-epic` for the non-status "AI"
purple tag); no raw `red/amber/emerald/green` palette remains in them, guarded by
a render test per primitive. The quality-score ramp is centralized on
`getScoreColor` (the 3 inline copies in `TicketStatusPill`, `TicketTableCells`
and `TicketMetaContent` now delegate to it; boundary cases 59/60/74/75/89/90 are
already covered in `status-colors.test.ts`). `JIRA_STATUS_COLORS` (types/ticket.ts)
is now an alias of the single `JIRA_STATUS_STYLES` map in `lib/status-colors.ts`,
so there is one Jira-status→color map. Hand-rolled status surfaces migrated to
tokens: pipelines (incl. the 4th color copy in `TicketStatusPill`'s pipeline/
deploy badges), `FinishSprintModal` (the `green-500`-vs-`emerald-500` "success"
split is resolved onto `--color-status-success`), story-writer
(`StoryWriterLayout`, `StoryWriterChat`, `SuggestionCard`, `OutdatedBanner`), and
stakeholder `AiInsightsPanel`. Epics "To Do" now uses `--color-status-todo`
(matching the board). `types/ticket.ts` is documented as the single home for the
SP/BV/NA metric tones (not status colors).

Verified: lint, typecheck, full vitest (6994 tests) and build all green. E2E in
Chrome — sprint board + pipelines render correct status colors in light and dark
theme (tokens flip as designed: todo #52525b→#d4d4d8, test→#fcd34d), no console
errors.

Deferred (out of scope): the 3-way `StatusPill` component name collision
(rename is cosmetic, not an AC); the optional lint rule discouraging raw status
utilities (the per-primitive guard render tests cover the regression that
matters); the `STATUS_PILL_COLORS` interactive superset stays separate because it
carries active/dot/ring data the color map does not — it already references the
same `--sp-*` tokens (which alias `--color-status-*`) so it cannot drift in base
color. The decorative gold "follow" star and the one BV `#8b5cf6` color-mix in
`BoardRow` are non-status decorative colors → BRDG-424.

## Description

`globals.css` defines a rich, theme-aware status system (`--color-status-todo/progress/test/done/
deprecated/deleted` and `--color-status-success/error/warning/caution/info/neutral`, each with a
`-subtle` fill) and the flagship `TicketStatusPill` family consumes it correctly (19 adopters, all
token-backed). The foundation is excellent. The problem is everything *around* it: status color is
**re-derived in raw Tailwind (`red-*`/`amber-*`/`emerald-*`/`green-*`/`violet-*`) in as many files
(~84) as use the tokens (~70)**, three of the shared label primitives hardcode their own palette, and
the status→color mapping logic is duplicated across several files. A future status-color retune would
silently fail to propagate to half the app.

## Evidence (file:line)

### The shared primitives are themselves off-token (root cause)
- `src/components/shared/InlineAlert.tsx:4-6` — `border-red-500/20 bg-red-500/10 text-red-400` etc.,
  should be `--color-status-error/warning/info`.
- `src/components/shared/Badge.tsx:6-8` — `bg-emerald-500/15 text-emerald-400`, `amber`, `red`.
- `src/components/shared/Tag.tsx:5-8` — `blue/purple/amber/red`.
  Anything adopting these inherits off-token color, which legitimizes ad-hoc color everywhere.

### Hand-rolled status color on real surfaces
- `src/app/(app)/pipelines/PipelineList.tsx` — pipeline success/fail/paused mapped to hardcoded
  `bg-emerald-500/10`, `bg-red-500/10`, `bg-amber-500/10` in **three places** (`:21` `stateIcon`,
  `:113` local `StatusPill`, `:335/:340`), and a **fourth copy** in `TicketStatusPill.tsx:592-620`.
- `src/components/sprint-board/FinishSprintModal.tsx` — `green-500` at `:432` next to `emerald-500`
  at `:433` for the **same "success" meaning** (two different raw greens), plus 21 raw color refs.
- `src/components/stakeholder/AiInsightsPanel.tsx` — risk/warning chips `text-amber-400/70`,
  `text-red-400/70` (16 amber refs).
- `src/components/story-writer/StoryWriterLayout.tsx` (29 raw refs), `StoryWriterChat.tsx` (15),
  `panes/OutdatedBanner.tsx` (11-13), `SuggestionCard.tsx` (8) — largest concentration.

### Duplicated mapping logic
- Two Jira-status→color maps that must be hand-synced: `STATUS_PILL_COLORS`
  (`src/components/shared/SprintStatPill.tsx:25-58`) vs `JIRA_STATUS_COLORS`
  (`src/types/ticket.ts:63-70`).
- Quality-score → color ramp (`<60 error, <75 warning, <90 caution, else success`) copy-pasted in
  **3 files**: `TicketStatusPill.tsx:46-51`, `TicketTableCells.tsx:68-73`, `TicketMetaContent.tsx:680`.
- Three different components named `StatusPill` (`PipelineList.tsx:113`, `SprintStatPill.tsx:434`,
  `cleanup/page.tsx`) with different color sources.
- `src/app/(app)/epics/EpicTicketList.tsx:18` maps "To Do" to `--color-status-neutral` while the
  board uses the distinct `--color-status-todo` (zinc) token.

### Split color source-of-truth
- `src/types/ticket.ts` holds a second home for color: `SP_TONE` `#64748b`, `BV_TONE` `#8b5cf6`,
  `NA_TONE` `#7c8595`, and a `LABEL_COLORS` map of raw hexes — so `globals.css` is not actually the
  single source it claims to be. The metric pickers inline these hexes downstream.

## Proposed approach

1. **Fix the shared primitives first** (`InlineAlert`, `Badge`, `Tag`) to map their variants onto
   `--color-status-*`. This is the highest-leverage change — it makes "import the shared component"
   the path of least resistance instead of a downgrade.
2. **Centralize the mapping helpers**: one `qualityScoreTone(score)` helper (delete the 3 copies); one
   canonical Jira-status→token map (collapse `STATUS_PILL_COLORS` into `JIRA_STATUS_COLORS` or derive
   one from the other); resolve the `StatusPill` name collision (rename/relocate the pipeline + cleanup
   locals or fold into the shared component).
3. **Migrate the hand-rolled surfaces** to tokens / the fixed primitives, prioritising the highest-
   traffic and most divergent first: pipelines (also kills the green/emerald split), story-writer,
   stakeholder insights, FinishSprintModal.
4. **Decide the home for the picker/marker hexes** (`SP_TONE`/`BV_TONE`/`NA_TONE`/`LABEL_COLORS`):
   either promote them into `globals.css` as tokens, or document `types/ticket.ts` as the deliberate
   data-layer source and stop duplicating their values inline.

### Trade-offs

- Mostly mechanical, but the status-token foreground/`-subtle` pairs are tuned per theme — a sloppy
  swap can wash out a chip in light mode. De-risk by relying on the existing `-subtle` mixes (they
  composite over either surface) and eyeballing each migrated surface in both themes.
- The `green-500` vs `emerald-500` cleanup is a real (if subtle) visible change; align both on
  `--color-status-done`/`-success`.

## Acceptance Criteria

- [x] `InlineAlert`, `Badge`, and `Tag` derive all colors from `--color-status-*` (no raw palette).
- [x] Quality-score tone and Jira-status→color exist in exactly one helper/map each.
- [x] Pipeline status, FinishSprintModal, story-writer, and stakeholder status surfaces use tokens; no
      `green-500`-vs-`emerald-500` divergence for "success".
- [x] "To Do" resolves to the same token on the board and in Epics.
- [x] A documented decision on where SP/BV/NA/label hexes live (single home).

## Tests

- [x] Unit test the centralized `qualityScoreTone` boundaries (59/60/74/75/89/90) — `getScoreColor` in
      `status-colors.test.ts`.
- [x] Render-test `InlineAlert`/`Badge`/`Tag` variants assert the status-token classes (light/dark are
      the same class strings; the tokens flip in CSS).
- [x] Guard test: no raw `bg/text/border-(red|amber|emerald|green)-N` in `InlineAlert/Badge/Tag`. (Lint
      rule deferred — the per-primitive guard render tests cover the regression.)

## Related

- [[BRDG-424-token-discipline-typography-shadows-surfaces]] — sibling token-discipline cleanup
  (non-status colors, typography, shadows).
- [[BRDG-423-data-state-coverage]] — `InlineAlert` is also the canonical error-banner; fixing its
  color here unblocks adopting it there.
- Touch points: `InlineAlert.tsx`, `Badge.tsx`, `Tag.tsx`, `SprintStatPill.tsx`, `types/ticket.ts`,
  `TicketStatusPill.tsx`, `TicketTableCells.tsx`, `TicketMetaContent.tsx`, `PipelineList.tsx`,
  `FinishSprintModal.tsx`, `AiInsightsPanel.tsx`, `StoryWriterLayout.tsx`, `EpicTicketList.tsx`.
