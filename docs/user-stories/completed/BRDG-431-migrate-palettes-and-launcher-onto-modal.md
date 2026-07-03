# BRDG-431: Migrate the command/search palettes + Story Writer launcher fully onto Modal

**Status:** Done (2026-07-03, branch ui-wave-427-431)
**Priority:** Low
**Type:** Accessibility — dialogs (follow-up of BRDG-422)

## Description

BRDG-422 gave the hand-rolled dialogs the user-visible dialog semantics — `role="dialog"`
+ `aria-modal`, the correct z-layer, Escape, and drag-safe `onMouseDown` close — and fully
routed `SplitStoryPicker` through `shared/Modal`. The three remaining dialogs were
**not** fully migrated to `Modal` because `Modal` would break their behaviour; they
therefore still lack `Modal`'s **focus trap + focus restore**. This story makes `Modal`
able to host them and migrates them.

## Evidence + why deferred

- `command-palette/CommandPalette.tsx` and `sprint-board/SearchModal.tsx` — palettes with a
  custom entrance/exit animation (a `closing` / `searchModalIn` state) and arrow-key result
  navigation. `Modal` unmounts children immediately on close (kills the exit animation) and its
  Tab-trap can fight the arrow-key navigation.
- `shared/StoryWriterLauncherModal.tsx` — embeds a nested `ConfirmDialog` (itself a `Modal`); a
  second focus-trap on the same document would conflict with the launcher's.

## Proposed approach

1. Give `Modal` an **animation-aware close** (keep children mounted through an exit transition)
   or a palette variant that preserves the entrance/exit animation.
2. Make the focus-trap **nesting-safe** (only the topmost open Modal traps Tab), so a launcher +
   nested ConfirmDialog don't fight.
3. Ensure the palette's arrow-key result navigation still works under the trap (Tab trapped,
   Arrow/Enter pass through to the palette handler).
4. Migrate CommandPalette, SearchModal and StoryWriterLauncherModal onto `Modal` (gaining focus
   trap + restore); keep their animations.

### Trade-offs
- The trickiest overlay work (custom keyboard + animation + nested modal). The user-visible
  inversion/aria gaps are already closed in BRDG-422, so this is an accessibility-completeness
  pass, not a bug fix — hence Low priority.

## Acceptance Criteria

- [x] CommandPalette, SearchModal and StoryWriterLauncherModal route through `Modal` with focus
      trap + restore, while keeping their entrance/exit animation and arrow-key navigation.
- [x] `Modal` supports an exit animation and nesting-safe focus trapping (verified with the
      launcher's nested ConfirmDialog).

## Tests

- [x] Behaviour tests: focus is trapped + restored to the trigger, arrow-key nav still works,
      exit animation runs, nested ConfirmDialog doesn't break the launcher's trap.
- [x] Existing command-palette / search / launcher tests stay green.

## Implementation notes (2026-07-03)

- Evidence drift at pickup: `StoryWriterLauncherModal` already routed through
  `Modal` (with its nested Modal-based `ConfirmDialog`); its remaining gap was
  the nesting-unsafe focus trap, fixed in `Modal` itself.
- `Modal` gained: a module-level modal stack so only the TOPMOST open modal
  traps Tab and handles Escape (launcher + nested ConfirmDialog no longer
  fight); `closeOnEscape={false}` for callers that own Escape (the palette,
  where Escape means "back" inside a sub-flow); `unstyledBackdrop` +
  `alignClassName` so palettes keep their animated backdrops and offsets.
- Exit-animation contract: the caller keeps `open` true while playing its
  closing transition and flips it afterwards; the palette's existing `closing`
  state is the reference implementation and now runs inside Modal.
- `CommandPalette` and `SearchModal` are hosted in `Modal` (gaining focus trap
  + restore); their entrance/exit animations, arrow-key navigation and
  combobox/listbox semantics are unchanged. SearchModal's own document-level
  Escape listener was removed (Modal owns it, topmost-gated).
- Browser-verified end-to-end (headless Chrome): palette opens focused,
  entrance/exit animation classes play, ArrowDown moves aria-activedescendant,
  Escape unmounts after the exit transition, focus returns to the trigger,
  Tab stays trapped; search modal opens/closes on the same contract.

## Related

- [[BRDG-422-unify-overlays-and-zindex-scale]] — parent (z + role/aria + SplitStoryPicker done there).
- [[BRDG-425-accessibility-baseline-pass]] — combobox/listbox roles for the palettes.
