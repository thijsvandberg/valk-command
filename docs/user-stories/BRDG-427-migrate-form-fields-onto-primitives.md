# BRDG-427: Migrate hand-rolled form fields onto the shared primitives + a Field wrapper

**Status:** Done (2026-07-03, branch ui-wave-427-431)
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

- [x] The listed modal/settings fields render via `TextInput`/`TextArea`/`Select`.
- [x] A shared `Field` wrapper exists (label + error + disabled) and is used by the migrated forms.
- [x] One placeholder syntax and one disabled-opacity value across the migrated forms.
- [x] The specialized SP number inputs and the borderless-search inputs are deliberately left as-is.

## Tests

- [x] Render test for `Field` (label, error text, disabled).
- [x] Existing modal/form tests stay green (update className assertions where the recipe changed).

## Implementation notes (2026-07-03)

Evidence drift found at pickup and resolved as follows:
- `CreateSessionModal.tsx` already used shared `TextInput` (done earlier) — dropped from scope.
- `DateTimePicker.tsx:220` is a button trigger with correct focus-visible treatment, not a
  text field — dropped. Its internal time input (`:347`) was normalized to the canonical
  values (`focus:border .../40`, `disabled:opacity-50`) without changing its specialized layout.
- Migrated: `CreateEpicModal`, `CreateSprintModal`, `SprintEditModal`, `SubFlowForm`
  (palette sub-form; its labels now use the standard Field label style instead of the
  smaller tertiary variant — judgment call, one look).
- `Field` supports `icon`, `hint`, `labelEnd` (right-aligned action; forces a div container
  because interactive content inside a label misfires activation) and `as="div"` for
  button-based controls like `DateTimePicker`.
- Placeholder sweep: the six files still on the dead v2 syntax `placeholder-text-muted`
  (no effect in Tailwind v4) now use `placeholder:text-text-muted` — placeholders in
  palette/search inputs pick up the intended muted color as a side effect.

## Related

- [[BRDG-420-consolidate-form-controls]] — parent (recipe + switch + universal focus rings shipped here).
- [[BRDG-425-accessibility-baseline-pass]] — label/aria associations overlap with the `Field` wrapper.
