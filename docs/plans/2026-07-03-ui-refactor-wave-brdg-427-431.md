# UI Refactor Wave: BRDG-427 through BRDG-431 (autonomous run plan)

**Date:** 2026-07-03
**Status:** Approved for autonomous execution (PO answered all upfront questions; run starts on explicit "start")
**Stories:** [[BRDG-427]] [[BRDG-428]] [[BRDG-429]] [[BRDG-430]] [[BRDG-431]] (all follow-ups of the completed BRDG-420/421/422 primitives work)

## Goal

Finish the convergence onto shared UI primitives so the app has one form recipe, one
anchored-panel primitive, one authoritative z-index scale, one tooltip, one toast stack,
and fully Modal-hosted dialogs. After this wave, styling/behaviour changes to these
patterns propagate from a single place.

## PO decisions (recorded 2026-07-03)

1. **Form look:** migrated forms adopt the shared TextInput/TextArea/Select recipe.
   The small visual shift per form is accepted; the shared recipe is the canonical look.
2. **Cadence:** fully autonomous, all five stories in one run, no pauses. Per story the
   PO receives a before/after visual report (light + dark) plus test results, reviewed
   afterwards.
3. **BRDG-431 included**, executed last. If it proves too fragile mid-run, stop only that
   story and report; earlier stories are unaffected.
4. **Ambiguities:** decide conservatively (keep current behaviour), continue, and list
   every judgment call prominently in the story report for the PO to overrule afterwards.

## Technical decisions (taken by the agent, flagged here for transparency)

- **New z-index token `z-popover` (65).** BRDG-428's critical caveat: portal pickers must
  float above modals (60) but should not share the tooltip layer (70). Resolution:
  extend the scale to `dropdown 50 < modal 60 < popover 65 < tooltip 70 < notification 80`.
  Assignment rule:
  - page-level dropdowns that never open inside a modal -> `z-dropdown`
  - portal pickers / anchored panels that can open inside a modal -> `z-popover`
  - tooltips and hover cards -> `z-tooltip`
  - toasts -> `z-notification`
  The token is introduced at the start of BRDG-429 (the primitive bakes it in); BRDG-428
  completes adoption and locks the guard test.
- **The anchored-panel primitive extends `BasePicker`'s floating-ui positioning**, not
  `Popover`'s CSS-only approach: BasePicker already has portal + collision handling
  (computePosition/offset/flip/shift), which is the hard part. Popover becomes a thin
  wrapper or is migrated onto it.

## Execution order and rationale

`427 -> 429 -> 428 -> 430 -> 431`

- **427 first:** independent, low risk, and the only story with intentional visible
  changes; its report gives the PO early signal on the unified look.
- **429 before 428:** converging panels onto one primitive removes many raw z-values by
  construction, shrinking 428's sweep.
- **428 third:** mechanical sweep of the remainder onto tokens + tighten the guard test.
- **430 fourth:** tooltip/hover cards reuse the 429 primitive's positioning; toast fix
  (ExportToasts is on `z-50`, off-layer) lands with the token scale already final.
- **431 last:** deepest behaviour risk (palette animation + keyboard), isolated at the end.

## Evidence drift found during planning (scout verification 2026-07-03)

Corrections to the story files, to apply when picking each story up:

- **BRDG-427:** `CreateSessionModal.tsx` already uses shared `TextInput` (done, drop from
  scope). `DateTimePicker.tsx:220` is a button trigger with correct focus-visible
  treatment, not a text field (drop). `SubFlowForm.tsx` already uses the canonical `/40`
  focus border but is still a hand-rolled input (keep, verify). Remaining core scope:
  `CreateEpicModal`, `CreateSprintModal`, `SprintEditModal` (all still on `/50` focus
  opacity and local recipes) + `Field` wrapper + placeholder/disabled sweep.
- **BRDG-428:** raw counts now: 68x `z-50`, 14x `z-[9999]`, 4x `zIndex: 9999`, 3x `z-[100]`.
- **BRDG-430:** toast state: `ui/Toast.tsx` (`z-notification`), sync ActivityToast stack
  (`z-notification`), `ExportToasts.tsx` (**`z-50`, off-layer, must fix**),
  `sprintMoveToast.tsx` (content function, not a component). Hover-card family:
  `RefinementGemHoverCard`, `TicketStatusPill` hover card, `OpenSubtasksIndicator`.
- **BRDG-431:** `StoryWriterLauncherModal` already routes through `Modal` (with nested
  `ConfirmDialog`, also Modal-based); its remaining scope is only the nesting-safe focus
  trap. CommandPalette and SearchModal are still hand-rolled (with `role="dialog"` +
  `aria-modal` already in place from BRDG-422). `Modal` currently has focus trap + restore
  but no exit-animation support (children unmount immediately).

## Per-story work breakdown

### Story 1: BRDG-427 (form fields onto primitives + Field wrapper)

1. Add `src/components/shared/Field.tsx`: label + optional error text
   (`--color-status-error`) + disabled state; render test.
2. Migrate `CreateEpicModal`, `CreateSprintModal`, `SprintEditModal` fields onto
   `TextInput`/`TextArea`/`Select` wrapped in `Field`; forward refs/handlers via `...rest`.
3. Evaluate `SubFlowForm` (floating recipe C): migrate if the shared component fits the
   floating layout; otherwise leave and record as judgment call.
4. Sweep placeholder syntax to `placeholder:text-text-muted` and disabled opacity to
   `disabled:opacity-50` across the migrated forms.
5. Update story file: mark CreateSessionModal/DateTimePicker as already-done/dropped.

Visual report surfaces: Create Epic modal, Create Sprint modal, Sprint Edit modal
(each: empty + filled + focused field, light + dark).

### Story 2: BRDG-429 (one anchored-panel primitive)

1. Introduce the `z-popover` token in `globals.css` (65, between modal and tooltip).
2. Build/extend the primitive (working name `AnchoredPanel`, grown out of `BasePicker`):
   portal + inline mode, floating-ui collision (flip/clamp), Escape close,
   outside-`onMouseDown` close, anchor- and cursor-positioning.
3. Migrate: `AnchoredMenu` + `CursorMenu` (ticket-action-menu), the 5 pipelines
   `FilterBar` `z-40`-catcher dropdowns, `Popover` call sites, per-file `absolute z-50`
   dropdowns. `MenuList` (BRDG-421) renders inside for menus.
4. `FilterDropdown` `escapeClose:false`: normalize to Escape-closes unless a concrete
   reason emerges; record as judgment call either way.
5. Behaviour tests: open/close, Escape, outside-click, flip on collision, cursor mode.

Visual report surfaces: ticket row context menu (right-click + kebab), pipelines filter
dropdowns, board filter dropdown, one picker inside a modal (light + dark).

### Story 3: BRDG-428 (z-index tokens authoritative)

1. Sweep all remaining raw overlay z-values (`z-50`/`z-[9999]`/`zIndex:9999`/`z-[100]`)
   onto the five tokens per the assignment rule above.
2. Explicitly verify in the browser: StoryPoint/BusinessValue/Epic/Assignee pickers opened
   from inside a modal float above it; tooltips above pickers; toasts above everything.
3. Extend `overlay-zindex-guard.test.ts`: no raw overlay z-values allowed anymore (drop
   the "broad sweep deferred" exemption), allow the five tokens only.

Visual report surfaces: picker-inside-modal stacking (ticket sidebar + Sprint Edit),
tooltip over an open picker, toast over an open modal (light + dark).

### Story 4: BRDG-430 (one tooltip, one toast)

1. Tooltip: standardize on `shared/Tooltip` (repositioned onto the 429 primitive's
   floating-ui logic where sensible), on `z-tooltip`. Migrate `RefinementGemHoverCard`,
   `TicketStatusPill` hover card, `OpenSubtasksIndicator` popover where they are
   tooltip-shaped; leave genuinely interactive hover cards on the anchored-panel
   primitive and record the split as a judgment call.
2. Toast: one stack/queue component on `z-notification`; route `ExportToasts` (fixing its
   off-layer `z-50`) and `sprintMoveToast` through it; keep the sync ActivityToast stack
   behaviour.
3. Render/behaviour tests for both; existing toast/tooltip tests stay green.

Visual report surfaces: board hover cards (gem, status pill, subtasks), export toast,
sprint-move toast, sync toast stack (light + dark).

### Story 5: BRDG-431 (palettes + launcher fully onto Modal)

1. Add exit-animation support to `Modal` (children stay mounted through the exit
   transition) without changing existing call sites' behaviour.
2. Make the focus trap nesting-safe: only the topmost open Modal traps Tab (fixes the
   launcher + nested ConfirmDialog pair).
3. Migrate `CommandPalette` and `SearchModal` onto `Modal`: keep entrance/exit animations
   and arrow-key result navigation (Tab trapped; Arrow/Enter pass through).
4. Behaviour tests: focus trapped + restored to trigger, arrow keys work, exit animation
   runs, nested ConfirmDialog does not break the launcher's trap.
5. Abort rule (PO-approved): if palette behaviour cannot be preserved cleanly, stop this
   story, leave code untouched, report why; the wave still counts as delivered for 427-430.

Visual report surfaces: command palette open/close (incl. exit animation as GIF if
feasible), search modal, launcher + discard confirm (light + dark).

## Autonomous run protocol (applies to every story)

**Preconditions (checked once at run start):**
- If the working tree is dirty with unrelated parallel work, run the wave in a dedicated
  worktree on branch `ui-wave-427-431` off `dev`, merged back per story or at wave end.
  If clean, work directly on `dev`. Never switch branches in the main checkout without
  approval (hook-enforced).
- Dev server on 3101 (check with a single curl before starting one; never a second instance).

**Per story, in order:**
1. Capture BEFORE screenshots of the story's report surfaces (headless Chrome, dev auth
   bypass via `GET /api/dev/bypass`, light + dark). Store locally under a gitignored
   `screenshots/ui-wave/` folder; screenshots are not committed.
2. Implement (steps above). Stay strictly inside story scope; out-of-scope findings go to
   `docs/todo.md`, not into the diff.
3. Quality gates, all green before commit: `npm run lint`, `npm run typecheck`,
   `npx vitest run` (single foreground run, no pipes), `npm run build`. Restart the dev
   server after the build.
4. Capture AFTER screenshots of the same surfaces.
5. Update the story file: check off acceptance criteria and tests, set Status, note
   judgment calls. Update `docs/architecture/` where component contracts changed
   (at minimum the shared-primitives/overlay docs for 428/429/430/431).
6. Commit: conventional commit, explicit paths only (no `git add -A`), no Co-Authored-By,
   one commit per story (plus a separate commit if a story splits naturally, e.g. 430
   tooltip vs toast).
7. Produce the story report (see format) and continue to the next story without pausing.

**Story report format (delivered in chat per story):**
- What changed, in PO terms (one short paragraph).
- Before/after screenshots side by side, per surface, light + dark.
- Judgment calls: every ambiguity resolved by best judgment, with the conservative choice
  taken and how to overrule it.
- Test results: suite counts, new tests added, gates status.
- Commit hash(es).

**Escalation policy:** never pause for questions mid-run. Conservative default = preserve
current behaviour. Only a hard blocker (e.g. gates cannot go green without out-of-scope
changes) stops a story; the run then continues with the next story and the blocker is
reported at the end.

## Out of scope (explicitly, per the stories)

- The specialized StoryPointPicker number inputs (`h-10 w-10` with appearance overrides).
- The borderless-input-inside-bordered-container family (CommandPalette input,
  FilterDropdown search, BasePicker search, SearchModal input) as *form fields*; they are
  touched only where 429/431 change their containers.
- Any restyling beyond the canonical recipes; no new visual design.
- TicketRow.tsx (legacy, being phased out) gets no investment beyond mechanical token
  swaps if it appears in the z-sweep.

## Definition of done for the wave

- All acceptance-criteria checkboxes in the five story files checked (or explicitly
  marked dropped-with-reason), statuses updated, stories moved to `completed/`.
- Guard tests enforce the end state: form recipe (`focus-ring-guard`), z tokens only
  (`overlay-zindex-guard`), plus new primitive/tooltip/toast behaviour tests.
- Five story reports with visual before/after delivered in chat.
- `docs/architecture/` updated for the changed component contracts.

## Execution result (2026-07-03)

Executed end-to-end on branch `ui-wave-427-431` (worktree, isolated from the parallel session).
All five stories done, gates green after merging latest dev (7565 tests), delivered as
[PR #51](https://github.com/thijsvandberg/valk-command/pull/51). Visual before/after report:
`~/Projects/orchestrator/ui-wave-screens/report.html`. Per-story judgment calls live in the
archived story files under docs/user-stories/completed/.
