# BRDG-427: Migrate hand-rolled form fields onto the shared primitives + a Field wrapper

**Status:** Not Started
**Priority:** Medium
**Type:** Consistency — form controls (follow-up of BRDG-420)

## Description

BRDG-420 established the canonical form recipe and shipped the accessibility-critical
parts: `shared/TextInput`/`TextArea` now carry a visible brand focus ring, a shared
`shared/Select` exists, there is one app-wide `ToggleSwitch`, and **every** field
already has a keyboard focus indicator (guarded by `focus-ring-guard.test.ts`).

What remains is the **component-by-component swap**: the hand-rolled `<input>` /
`<textarea>` / native `<select>` in the modal + settings forms still use their own
recipes instead of the shared components, so a future recipe change won't propagate.
This is the broad, low-risk tail BRDG-420 deferred. **Note: this is a visible
consolidation** — the shared `TextInput` (`border-strong` + `overlay-subtle` +
`text-body-lg`) looks slightly different from the current modal recipe
(`border-default` + `surface-elevated` + `text-body-sm`), so each migrated form
shifts appearance a little. That is the point (one look), but verify per form in
both themes.

## Evidence (file:line)

Hand-rolled bordered fields still on a local recipe (the BRDG-420 "recipe B/C/D"):
- `src/app/(app)/epics/CreateEpicModal.tsx:80` (input) + `:101` (textarea) — recipe B.
- `src/components/sprint-board/CreateSprintModal.tsx:125` (input) + `:213` (textarea).
- `src/components/sprint-board/SprintEditModal.tsx:358` (input) + `:445` (textarea).
- `src/components/refinement-session/CreateSessionModal.tsx:70` (input) — recipe D.
- `src/components/shared/DateTimePicker.tsx:220` — recipe B.
- `src/components/command-palette/SubFlowForm.tsx` — recipe C (floating).

Explicitly NOT candidates (leave as-is):
- The two specialized number inputs in `src/components/shared/StoryPointPicker.tsx:210,218`
  (fixed `h-10 w-10` SP entry with `appearance` overrides) — wrong fit for the generic field.
- The "borderless input inside a bordered container" family (CommandPalette,
  FilterDropdown, BasePicker search, SearchModal*) — legitimately distinct; they already
  have a keyboard focus ring from BRDG-420.

Other drift to finish:
- Placeholder syntax split — standardize remaining call sites on `placeholder:text-text-muted`.
- Disabled opacity split (`40`/`50`/`60`) — standardize on `disabled:opacity-50`.

## Proposed approach

1. Swap each listed modal/settings field to `<TextInput>` / `<TextArea>` / `<Select>`.
   Forward `ref`, `onKeyDown`, `placeholder`, etc. via the components' `...rest`. Pick the
   size prop closest to the current field; accept the unified look.
2. Add `src/components/shared/Field.tsx` — a small wrapper carrying `label` + optional
   `error` text (`--color-status-error`) + `disabled` state, so forms stop hand-rolling the
   label/error scaffold. Adopt it in the migrated modals.
3. Sweep the remaining placeholder + disabled-opacity call sites onto the canonical values.

### Trade-offs
- Low risk per change, but it is volume + a real (small) visual shift per form. Migrate
  incrementally, one form at a time, and eyeball each in light + dark before moving on.

## Acceptance Criteria

- [ ] The listed modal/settings fields render via `TextInput`/`TextArea`/`Select`.
- [ ] A shared `Field` wrapper exists (label + error + disabled) and is used by the migrated forms.
- [ ] One placeholder syntax and one disabled-opacity value across the migrated forms.
- [ ] The specialized SP number inputs and the borderless-search inputs are deliberately left as-is.

## Tests

- [ ] Render test for `Field` (label, error text, disabled).
- [ ] Existing modal/form tests stay green (update className assertions where the recipe changed).

## Related

- [[BRDG-420-consolidate-form-controls]] — parent (recipe + switch + universal focus rings shipped here).
- [[BRDG-425-accessibility-baseline-pass]] — label/aria associations overlap with the `Field` wrapper.
