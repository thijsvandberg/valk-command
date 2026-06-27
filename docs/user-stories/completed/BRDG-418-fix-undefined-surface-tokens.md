# BRDG-418: Fix undefined surface tokens rendering transparent backgrounds

**Status:** Completed
**Priority:** High
**Type:** Bug — design tokens (UI audit, quick win)

## Description

Several inputs, search boxes, and section headers reference CSS custom properties that **do not
exist** in `src/app/globals.css`. Tailwind emits `background-color: var(--color-surface-default)`,
but because no such variable is defined, the declaration is invalid and the element falls back to a
**transparent** background. The author clearly intended a real surface token (`surface-base` or
`surface-elevated`).

This was verified live in the browser: `getComputedStyle(document.documentElement)` returns an empty
string for `--color-surface-default`, `--color-surface-primary`, and `--color-surface-secondary`,
while the real tokens (`--color-surface-elevated`, `--color-surface-floating`) resolve to `#fff`.
The only defined surface tokens are `surface-base / elevated / elevated-hover / chrome / toolbar /
floating`.

This is a genuine visual bug (transparent fill where a solid one was intended), not just a
consistency nit — which is why it is split out as its own quick-win story ahead of the larger
convergence work.

## Evidence (file:line)

`bg-[var(--color-surface-default)]` (token does not exist — 8 sites, 5 files):
- `src/components/ticket-detail/LinkIssueDialog.tsx:182,224,284` (search / filter inputs)
- `src/components/ticket-detail/RelationPicker.tsx:68`
- `src/components/shared/EstimatePicker.tsx:279`
- `src/components/shared/StoryPointPicker.tsx:210,218`
- `src/components/sprint-board/FullnessMeter.tsx:160`

`bg-surface-primary` / `bg-surface-secondary` (tokens do not exist — 2 sites):
- `src/components/story-writer/LinkSuggestionChips.tsx:148` (section header), `:174` (skeleton loader)

## Proposed approach

1. Decide the intended token per site (most are picker/dialog search inputs → `surface-base` to read
   as an inset field, or `surface-elevated` to match the surrounding card; the `LinkSuggestionChips`
   header → `surface-elevated`, its skeleton → `overlay-subtle`). Confirm against the neighbouring
   elements in each file so the fill matches its container in both themes.
2. Replace every reference with the chosen defined token.
3. Add a guard so this class of bug cannot recur (see Tests).

### Trade-off

Trivial, low-risk find/replace. The only judgement is *which* surface token each site wants; getting
it slightly wrong is still strictly better than the current transparent render and is easy to tune.

## Implementation Plan

Defined tokens (globals.css `@theme`): `surface-base/elevated/elevated-hover/chrome/toolbar/floating`,
`overlay-subtle/default/strong`. All have light-theme overrides, so any chosen token is theme-aware.
`surface-default` / `surface-primary` / `surface-secondary` are genuinely absent. Use bare utility
forms (`bg-surface-base`) to match the rest of the codebase.

### Token substitution per site

All inset inputs sit inside an `elevated` modal/dropdown or a `floating` picker popover, so the
recessed-field token is `surface-base` (one step below its container, reads as inset in both themes):

- `LinkIssueDialog.tsx:182,224,284` (trigger + filter + search inputs, inside `surface-elevated`) -> `bg-surface-base`
- `RelationPicker.tsx:68` (filter input, dropdown is `surface-elevated`) -> `bg-surface-base`
- `EstimatePicker.tsx:279` (custom input, popover is `surface-floating`) -> `bg-surface-base`
- `StoryPointPicker.tsx:210,218` (custom inputs, popover is `surface-floating`) -> `bg-surface-base`
- `FullnessMeter.tsx:160` (inline field focus fill) -> `focus:bg-surface-base`
- `LinkSuggestionChips.tsx:148` (relation grouping sub-header) -> `bg-surface-elevated`; `:174` (skeleton) -> `bg-overlay-subtle`
- `dev/exploration/capacity-meter/page.tsx:47,51,55` (focus fill) -> `focus:bg-surface-base`; `:154` (header row) -> `bg-surface-elevated`
- `dev/exploration/estimate-entry/page.tsx:325` (custom input) -> `bg-surface-base`

The dev exploration pages are not in the story evidence but live in `src/` and would trip the guard,
so they are fixed too (separate commit).

### Static guard test

`src/app/globals.surface-tokens.test.ts` (node env). Reads declared `--color-(surface|overlay)-*`
token names from `globals.css`, then scans all `src/**/*.{ts,tsx}` (via `fast-glob`, already a dep)
for both `var(--color-(surface|overlay)-*)` and `(prefix:)?bg-(surface|overlay)-*` usages, and asserts
every referenced token is declared. Excludes the guard test file itself. Declaration-driven (not a
hardcoded blocklist), so it also protects BRDG-424 against future typos.

### Render assertions

Class-presence assertions (jsdom cannot resolve CSS-var colors) on `LinkIssueDialog`,
`StoryPointPicker`, `EstimatePicker`: the field className contains `surface-base` and not
`surface-default`. No brittle pixel snapshot.

### Commit order

1. Guard test (red against current tree). 2. Production component fixes. 3. Dev exploration fixes +
render assertions.

## Acceptance Criteria

- [x] No `var(--color-surface-default)`, `bg-surface-primary`, or `bg-surface-secondary` references
      remain in the codebase.
- [x] Each affected input/header/skeleton has a visible, intentional background in both light and
      dark themes.
- [x] No new hardcoded color is introduced (use the existing surface tokens only).

## Tests

- [x] A static guard test that scans `src/` for `var(--color-surface-*)` / `bg-surface-*` usages and
      asserts each referenced token is declared in `globals.css` (fails the build on an undefined
      surface token). This also protects BRDG-424.
      (`src/app/globals.surface-tokens.test.ts`)
- [x] Visual/snapshot check of `LinkIssueDialog`, `StoryPointPicker`, and `EstimatePicker` showing a
      non-transparent field background. Implemented as class-presence assertions in each component's
      co-located test (jsdom cannot resolve CSS-var colors, so a pixel snapshot would assert nothing);
      live visual confirmation done in-browser during final verification.

## Related

- [[BRDG-424-token-discipline-typography-shadows-surfaces]] — the broader "use the token system, not
  arbitrary values" cleanup; this is the urgent bug subset.
- [[BRDG-420-consolidate-form-controls]] — the pickers/dialogs here are also part of the form-control
  convergence; fix the token first, migrate the recipe there.
- Touch points: `LinkIssueDialog.tsx`, `RelationPicker.tsx`, `EstimatePicker.tsx`,
  `StoryPointPicker.tsx`, `FullnessMeter.tsx`, `LinkSuggestionChips.tsx`, `globals.css`.
