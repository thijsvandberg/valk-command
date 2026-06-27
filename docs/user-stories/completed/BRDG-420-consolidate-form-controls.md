# BRDG-420: Consolidate form controls on shared primitives (inputs, one toggle, universal focus rings)

**Status:** Completed (core shipped; remaining input-adoption split into [[BRDG-427-migrate-form-fields-onto-primitives]])
**Priority:** High
**Type:** Consistency + accessibility — form controls

## Status (run note)

The two headline, accessibility-critical criteria are fully shipped; the broad
"migrate every hand-rolled field onto the primitive" cleanup is deferred.

**Shipped (committed + E2E-verified):**
- **One switch app-wide.** The oversized `h-6 w-11` `bg-white`-knob notifications
  switches (both the per-row `Toggle` and the page-level browser-notifications
  toggle) and the `DeploySettings` `bg-white` knob are gone — every switch is now
  the canonical `ToggleSwitch` look (verified in Chrome: all 18 switches on the
  notifications page render at the canonical 30×17, zero `bg-white`).
- **Universal focus indicator.** Every production field that used
  `focus:outline-none` now also carries a keyboard focus ring (a `focus-visible`
  inset ring); the canonical `TextInput`/`TextArea` focus was strengthened to a
  visible `focus:border-brand + ring-1 ring-brand/30`. A guard test
  (`focus-ring-guard.test.ts`) fails on any new focusless `focus:outline-none`.
- **Shared `Select`** added on the same recipe (one border/surface/radius/focus/
  disabled), filling the gap (no shared select existed).
- Tests: `ToggleSwitch.test.tsx`, `Select.test.tsx`, the focus-ring guard; lint/
  typecheck/vitest (7032)/build all green.

**Remaining work split into a follow-up (per PO request):**
- [[BRDG-427-migrate-form-fields-onto-primitives]] — swap the hand-rolled modal/settings
  `<input>`/`<textarea>`/`<select>` onto `TextInput`/`TextArea`/`Select`, add a `Field`
  wrapper (label + error + disabled), and finish the placeholder/disabled sweep. Carries
  a small per-form visual shift (the unified look), so it was kept separate for PO review.

Note for the PO: the notifications switch is now the smaller, on-brand size (a
visible shrink, pre-approved in the audit). A pre-existing hydration warning on the
notifications page (the permission ShieldCheck/ShieldX icon renders differently
server vs client) is unrelated to this work.

## Description

Shared form primitives **already exist** (`shared/TextInput.tsx`, `shared/TextArea.tsx`,
`shared/Checkbox.tsx`, `shared/Radio.tsx`, `shared/ToggleSwitch.tsx`) but are largely **abandoned**:
`TextInput` is imported by ~6 of ~43 files with raw `<input>`, `TextArea` by 1 of ~23 files with
`<textarea>`, and `ToggleSwitch` by 1 file. Only `Checkbox` is well adopted (~19 files, and it is the
one healthy control). As a result, text fields are hand-rolled with **four competing recipes**, there
are **two visually different switches** plus a checkbox-as-toggle, and **~29 inputs have no visible
focus state at all**. Every new form drifts because adopting the shared primitive is optional.

## Evidence (file:line)

### Four competing input recipes (border / bg / radius / text size / focus all differ)
- A — shared `TextInput`/`TextArea`: `border-strong`, `overlay-subtle`, `rounded-lg`, no ring.
- B — modal recipe: `border-default` + `surface-elevated` + `rounded-lg` + `focus:ring-1 ring-brand/30`
  (`CreateEpicModal.tsx:88`, `CreateSprintModal`, `SprintEditModal`, `DateTimePicker.tsx:220`).
- C — floating recipe: `border-strong` + `surface-floating` + `rounded-md` (`SubFlowForm`,
  `SplitStoryPicker`).
- D — session recipe: `focus:border-brand` full opacity + ring (`CreateSessionModal.tsx:82`).
- Plus the undefined-token fields tracked in [[BRDG-418-fix-undefined-surface-tokens]].

### Two switches + a checkbox-as-toggle for the same on/off action
- Canonical `shared/ToggleSwitch.tsx:26-40` — `h-4 w-7`, translucent `bg-brand-500/25` track.
- `src/app/(app)/settings/notifications/page.tsx:79-93` — hand-rolled `role="switch"`, **`h-6 w-11`,
  solid `bg-brand-500` track, white knob** (measured live at ~47×26px vs the canonical ~28×16px —
  nearly double). `DeploySettings.tsx:173` also uses a `bg-white` knob.
- `ColumnToggle.tsx` / `BoardFieldToggle.tsx` use the checkbox pattern for what is conceptually a
  toggle — a third metaphor for the same intent.

### ~29 inputs with `focus:outline-none` and no replacement focus ring (accessibility)
`StoryWriterChat.tsx:633`, `TitleInput.tsx:75`, `ticket-detail/EditableTitle.tsx:140/151`,
`ChildIssueComposer.tsx:161/170`, `LinkedIssuesSection.tsx:597/613`, `EpicChildrenSection.tsx:913/920`,
`SubtasksSection.tsx:746/753`, `BasePicker.tsx:312`, `FilterDropdown.tsx:101/154/194`,
`CommandPalette.tsx:102`, the People search (`settings/people/page.tsx:121`), and more.

### Lower-severity drift
- Placeholder syntax split: `placeholder:text-text-muted` (51) vs `placeholder-text-muted` (15), plus
  `placeholder-text-tertiary` (a different shade) in chat inputs.
- No field-level disabled/error styling; disabled opacity is `40`/`50`/`60` inconsistently. Errors
  only ever appear as separate banner divs (see [[BRDG-419-status-color-single-source-of-truth]]).

## Proposed approach

1. **Decide the canonical recipe** for `TextInput`/`TextArea`/`Select` (one border token, one bg, one
   radius, one focus treatment — recommend a visible `focus:border-brand + ring-1 ring-brand/30` since
   a focus indicator is non-negotiable). Add a shared `Select` (none exists) and a small `Field`
   wrapper carrying label + error + disabled states.
2. **Migrate hand-rolled fields onto the primitives**, view by view, highest-traffic first
   (settings, story-writer, ticket-detail composers, modals). The "borderless input inside a bordered
   container" family (CommandPalette, FilterDropdown, BasePicker search) is legitimately distinct —
   keep it, but give the *wrapper* a `focus-within` ring so keyboard focus is visible.
3. **Pick one switch.** Standardize on `ToggleSwitch`; replace the notifications/DeploySettings
   hand-rolled switches; decide whether the board column/field toggles should be switches or stay
   checkboxes (they read as filters → checkboxes may be correct, just make it deliberate).
4. **Guarantee a focus indicator** on every interactive field (this is the accessibility-critical
   part and overlaps [[BRDG-425-accessibility-baseline-pass]]).

### Trade-offs

- This is broad but low-risk per change (cosmetic + focus). The risk is volume/regression in form
  submission behaviour — migrate incrementally and lean on existing form tests. The `ToggleSwitch`
  size change on the notifications page is a visible shrink; confirm the PO is fine with the smaller,
  on-brand switch (it is the canonical look used elsewhere).

## Acceptance Criteria

- [~] One documented input/textarea/select recipe; `TextInput`/`TextArea`/new `Select` adopted across
      settings, modals, story-writer, and ticket-detail composers. **Done:** one recipe + new `Select`.
      **Deferred:** swapping existing hand-rolled fields onto the components (broad, low-risk).
- [x] One switch component app-wide; the `h-6 w-11` notifications switch and `bg-white` knobs are gone.
- [x] Every text field, search box, and select shows a visible focus indicator (ring or border).
- [~] One placeholder color/syntax; one disabled-opacity value; a shared error/disabled field state.
      **Done** in the primitives; the app-wide sweep + shared `Field` error/disabled state **deferred**.

## Tests

- [x] Render tests for the canonical field + switch (focus ring + disabled) — `Select.test.tsx`,
      `ToggleSwitch.test.tsx`. (Error-state test deferred with the `Field` wrapper.)
- [x] Guard test: no `focus:outline-none` without an accompanying `focus`/`focus-visible` ring or
      border in the same className — `focus-ring-guard.test.ts`.
- [x] Existing settings / story-writer / ticket-detail form tests stay green (7032 pass).

## Related

- [[BRDG-418-fix-undefined-surface-tokens]] — the transparent picker fields are part of this surface.
- [[BRDG-425-accessibility-baseline-pass]] — the focus-ring + input-label gaps overlap; sequence
  together so a field is fixed for look and a11y in one pass.
- [[BRDG-419-status-color-single-source-of-truth]] — field error styling depends on the status tokens.
- Touch points: `shared/TextInput.tsx`, `shared/TextArea.tsx`, `shared/ToggleSwitch.tsx`,
  `settings/notifications/page.tsx`, `DeploySettings.tsx`, the four modal recipes, the composer inputs.
