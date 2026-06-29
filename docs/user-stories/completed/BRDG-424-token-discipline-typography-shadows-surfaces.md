# BRDG-424: Token discipline cleanup (typography, shadows, surfaces)

**Status:** Done
**Priority:** Medium
**Type:** Consistency — design tokens (largely mechanical)

## Status (run note)

Shipped to `dev` in several codemod slices:

- **Typography** — codemod of all exact-duplicate `text-[Npx]` onto the scale
  (`10->caption`, `11->label`, `12->body-sm`, `13->body`, `15->heading-sm`,
  `18->heading`); added `--text-micro` (9px) for the recurring micro-labels and
  rounded the lone 8px chart axis onto it. Wordmark (19px) and the wrap-up
  celebration (22px) stay as documented brand/decorative exceptions.
- **Fonts** — `--font-space-mono` declared in `@theme`; the `bridge_` wordmark
  now uses the `font-space-mono` utility. Added `--tracking-label` (0.06em) and
  consolidated the five uppercase-eyebrow letter-spacings; added `--leading-body`
  /`--leading-prose` for the two dominant body line-heights.
- **font-display on headings (visual change, flagged)** — applied to the **8**
  genuine presentational section/panel/page headings that lacked it (stakeholder
  sprint cards, Split-story modal title, ticket Development section, pipelines
  Deploy notifications, cleanup Scans / Deep-scan queue). **Deliberately NOT the
  ~51 the evidence implied:** on inspection most of those are uppercase eyebrow
  micro-labels or content/data titles (issue summaries, story titles, search
  results) where a display face reads wrong. Agreed rule: display font on
  presentational headings; body font on eyebrow labels and content.
- **Shadows/surfaces** — unified the invocation form onto bare utilities
  (`bg/ring/from-surface-*`, `shadow-sm/md/lg/xl/2xl/popover/modal`); mapped the
  plain neutral box-shadows onto the scale by role (cards->sm, dropdowns->popover,
  floating->md). Focus/selection rings, brand-tinted glows and two bespoke
  treatments (nav-panel inset, keycap, the soft brand-tinted celebration modal)
  keep their raw form by design.
- **Hexes** — `#9b6cd4 -> var(--color-icon-epic)`; new `--color-chat-accent`
  (#a78bfa) and hover-shade tokens (`--color-icon-epic-hover`,
  `--color-status-error-hover`, `--color-status-done-hover`).
- **Guards** — `src/app/globals.token-discipline.test.ts` (no off-scale text, no
  raw neutral elevation shadow, no className hex). The 3 existing tests asserting
  the old `[var(--shadow-*)]`/`[var(--color-surface-*)]` spelling were updated.
- **Verified** — lint / typecheck / `vitest` (full) / build all green; Chrome
  spot-check in dark + light theme (token swaps identical, headings intentional,
  no console errors).
- **Deferred (1):** the refinement session page keeps its raw `#a78bfa` violet
  chat-accent (3 lines) and its `[var(--color-surface-*)]` forms — that file was
  under active parallel issue-icon work the whole run, so it was left to its
  owner and excluded from the className-hex guard. Trivial follow-up once settled.

## Description

`globals.css` defines a complete type scale, shadow scale, surface/overlay system, and font pairing —
but a long tail of code bypasses them with arbitrary values that happen to match (or nearly match) a
token. None of this is broken visually today; it is **consistency debt** that makes the design system
non-authoritative and any future retune leaky. This story collects the non-status token cleanup
(status color has its own story, [[BRDG-419-status-color-single-source-of-truth]]; the undefined-token
bug is [[BRDG-418-fix-undefined-surface-tokens]]). It can be tackled in independent slices (typography
/ shadows / surfaces).

## Evidence (file:line)

### Typography off-scale (the highest-volume offender)
- **214** `text-[10px]`/`text-[11px]` that exactly duplicate `text-caption`(10) / `text-label`(11),
  plus `text-[12/13/15/18px]` duplicates. Worst files: `FinishSprintModal.tsx` (12), `NavPanel.tsx`
  (11), `SprintStatsPopover.tsx` (9); worst dirs: `epics/`, `cleanup/`, `sprint-board/`.
- Genuinely off-scale (no token exists): `text-[9px]` (10×), `text-[8px]` (`BurnupChart.tsx:297`),
  `text-[19px]` (`ViewHeader.tsx:77`, refinement `:506` — the wordmark), `text-[22px]`
  (`SessionWrapUpCelebration.tsx:166`), inline `fontSize: "1rem"` (`AiInsightsPanel.tsx` ×3).
- Note: standard Tailwind sizes (`text-xs/sm/base/lg/xl`) are **0** uses — the team already avoids
  those; the gap is specifically the arbitrary-px habit.

### Fonts
- Only ~30 of 81 `<h1>-<h3>` carry `font-display`; the other ~51 render headings in the body font
  (Inter) — the mandated Bricolage-display / Inter-body hierarchy is applied mostly to big page titles
  only (settings, story-writer panels, ticket-detail sections, `MessageList` all use Inter headings).
- Space Mono (`--font-space-mono`, the `bridge_` wordmark at `ViewHeader.tsx:77`) is registered in
  `layout.tsx` but **not declared in the `@theme` block** — a third font the token system doesn't
  acknowledge.
- 5 different uppercase-label letter-spacings (`tracking-[0.06/0.08/0.1/0.12/0.14em]`) and 6 body
  `leading-[…]` values, none tokenized.

### Shadows
- **Invocation-form split**: `shadow-[var(--shadow-*)]` (119×) vs the bare remapped `shadow-*` utility
  (25×) — identical output, two spellings. Same for surfaces: `bg-[var(--color-surface-*)]` (~250×) vs
  bare `bg-surface-*` (~22×).
- **22 arbitrary raw box-shadows** bypass the scale, including modals/dropdowns
  (`SessionEndModal.tsx:432`, `EpicChildrenSection.tsx:932`, `SprintPlacementMenu.tsx:122`) and resting
  cards (`EpicRow.tsx:35`, `ChildStoryCard.tsx:107`) — these won't honor the separate light/dark shadow
  definitions.

### Surfaces / hardcoded hexes that are already tokens
- `#9b6cd4` (= `--color-icon-epic`) hardcoded at `CommandPalette.tsx:92`, `ResultItem.tsx:59`; violet
  chat accent `#a78bfa` repeated ~5× (`tickets/[key]/page.tsx:494`, refinement session page) with no
  token.
- Hover/active shades hardcoded because no hover token exists: `#d04840` (`TicketReview.tsx:390`),
  `#1ea34d` (`RefinementTicketList.tsx:127`), `#b48ee6` (`EpicPicker.tsx` hover).
- Card padding scatter for equivalent containers (`p-3`/`p-3.5`/`p-4`/`p-5`/`p-6`); modal radius
  `rounded-xl` vs `rounded-2xl`.

## Proposed approach

1. **Typography (biggest win, lowest risk):** codemod `text-[10px]`→`text-caption`,
   `text-[11px]`→`text-label`, and the other exact-duplicate px sizes to their tokens. For the
   genuinely off-scale sizes, either add a token (e.g. `text-micro` 9px if it's a real recurring need)
   or round to the nearest existing token. Keep the documented exceptions (page titles > 24px, relative
   `em` in code blocks).
2. **Fonts:** apply `font-display` to section headings (decide the cutoff — e.g. all `h1-h3` vs only
   `h1-h2`); declare `--font-space-mono` in `@theme` so the wordmark font is part of the system; add
   `--tracking-label` and a couple of `--leading-*` tokens and replace the one-off values.
3. **Shadows/surfaces:** pick ONE invocation form (recommend the bare remapped utilities `shadow-sm`
   /`bg-surface-elevated` — cleaner and grep-able) and codemod toward it; replace the 22 arbitrary
   box-shadows with the nearest token (modals→`shadow-modal`, dropdowns→`shadow-popover`,
   cards→`shadow-sm`); add hover-shade tokens so `#d04840`/`#1ea34d`/`#b48ee6` become
   `var(...)`; replace `#9b6cd4` with `--color-icon-epic`.
4. **Spacing:** agree a small padding scale for card vs modal vs row and nudge the outliers (lowest
   priority).

### Trade-offs

- Almost entirely mechanical and safe; the value is preventing future drift and making `globals.css`
  truly authoritative. The judgement calls are small (which heading level gets the display font; do
  we add a 9px token). Do it as several small codemod PRs rather than one — easier to review and to
  pause if a visual regression appears (the px→token swaps should be pixel-identical).

## Acceptance Criteria

- [x] No `text-[10px]`/`text-[11px]` (and other exact-duplicate px sizes) remain; off-scale sizes are
      either tokenized or rounded to an existing token.
- [x] Section headings use `font-display` per the agreed rule; `--font-space-mono` is declared in
      `@theme`; uppercase-label tracking and body line-height use tokens.
- [x] One invocation form for shadows and surfaces; the arbitrary box-shadows use the token scale
      (rings/brand-glows/bespoke treatments kept by design).
- [x] `#9b6cd4` and other already-a-token hexes reference the token; hover-shade tokens exist.

## Tests

- [x] Guard test: no `text-\[\d+px\]` in `src/components/**`/`src/app/(app)/**` outside an allowlist of
      documented exceptions.
- [x] Guard test: no raw `shadow-[0_…]` and no `#`-hex literals in className/inline style outside the
      decorative allowlist (rings, brand-glows, bespoke treatments; refinement page excluded pending
      parallel work).
- [x] Pixel-identity of px→token / shadow→token swaps confirmed by Chrome spot-check in dark + light
      theme (manual, in lieu of an automated visual-snapshot harness the project does not have).

## Related

- [[BRDG-418-fix-undefined-surface-tokens]] — the urgent surface-token bug subset (do first).
- [[BRDG-419-status-color-single-source-of-truth]] — status color discipline (separate, higher impact).
- Touch points: `globals.css` (`@theme`), `ViewHeader.tsx`, `CommandPalette.tsx`, `ResultItem.tsx`,
  `EpicRow.tsx`, `ChildStoryCard.tsx`, `SessionEndModal.tsx`, `EpicChildrenSection.tsx`,
  `TicketReview.tsx`, `RefinementTicketList.tsx`, broad sweep of `src/`.
