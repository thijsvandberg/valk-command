# BRDG-425: Accessibility baseline pass (keyboard + roles on primary views)

**Status:** Not Started
**Priority:** Medium
**Type:** Accessibility — keyboard nav, widget roles, focus, landmarks

## Description

The team clearly knows the patterns — `NavPanel` does a clickable `div` correctly (`role="button"` +
`tabIndex` + Enter/Space), `ConversationOverflowMenu` does menu roles correctly, collapsibles are 100%
`aria-expanded`, and a focus-visible token convention exists on `Button`. The gap is **consistency**:
the same patterns are applied unevenly, and the misses cluster on the most-trafficked surfaces (sprint
board, ticket detail, search). This is an internal single-user app, so it is Medium priority — but
keyboard operability of the primary views is the kind of thing that quietly erodes, and the fixes are
cheap. (Image `alt` coverage is already 100% — no work needed there.)

## Evidence (file:line)

### Clickable non-button elements with no keyboard support (the biggest real gap, ~34 sites)
- `sprint-board/BoardRow.tsx:398` — the primary board row is a `<tr onClick>` with no
  `role`/`tabIndex`/keyboard handler. (Partly mitigated by a global Arrow/Enter scheme in
  `useSprintBoardShortcuts.ts:36-40`, but the row itself is mouse-only and not in the tab order.)
- `ticket-detail/ChildIssueRow.tsx:166` — child/epic issue row `<div onClick>`, keyboard-unreachable.
- `pipelines/FilterBar.tsx:44,100,164,249,357` — 5 clickable `<div>` filter controls.
- `story-writer/ChatMessageParts.tsx:436,477,486`, `EditableDescription.tsx:614/626 (<p>)`,
  `VersionList.tsx:102`, `command-palette/CommandPalette.tsx:169`, `epics/EpicFilterBar.tsx:45`,
  `activity-log/ActivityTable.tsx:165`.
- Good example to copy: `nav/NavPanel.tsx:139`.

### Custom widgets missing roles
- **Tabs (0% compliant):** `shared/TabBar.tsx:40-68` — plain `<button>`/`<Link>`, no
  `role="tab"/"tablist"/"tabpanel"`, no `aria-selected`. Used across the whole ticket-detail interface.
- **Combobox/search (~40%):** `command-palette/CommandPalette.tsx:96-187` and
  `sprint-board/SearchModal.tsx` lack `role="combobox"/"listbox"/"option"` + `aria-activedescendant`.
  Good: `chat/ConversationList.tsx`, `rich-editor/slash-commands/SlashCommandMenu.tsx`.
- **Menus (~33%):** `stakeholder/StakeholderOverflowMenu.tsx:95-172`, `ticket-action-menu.tsx:155-262`
  lack `role="menu"/"menuitem"` and trigger `aria-haspopup`/`aria-expanded`.

### Focus indicator stripped with no replacement (overlaps [[BRDG-420-consolidate-form-controls]])
- Inline editors: `EditableTitle.tsx:151`, `chat/EditableConversationTitle.tsx:85`,
  `ChildIssueRow.tsx:266`, `EpicChildrenSection.tsx:920`, `LinkedIssuesSection.tsx:613`,
  `ChildIssueComposer.tsx:170`, `SubtasksSection.tsx:753` — `outline-none` with only a border-underline
  (weak/absent focus cue).
- **~15 raw `<button>` with a conditional `className={cond ? … : …}` and no focus ring** — the tail left
  by BRDG-421. The bulk (~273 buttons) and all field inputs already got a focus-visible ring (guarded by
  `menu-button-guard.test.ts` ratchet ≤16 and `focus-ring-guard.test.ts`); these conditional-className
  buttons couldn't be fixed by the mechanical sweep and need a per-site focus ring. Lower the
  `menu-button-guard` ratchet toward 0 as they are fixed.

### Headings / landmarks
- `shared/ViewHeader.tsx:137-143` renders page titles as `<span>`, so sprint-board, chat, epics,
  pipelines, and stakeholder pages have **no `<h1>`**. The persistent nav chrome is not a `<nav>`
  landmark (the expanded `NavPanel` is a `role="dialog"` popover). Skip-link + `<main id>` already exist.

### Unlabeled selects/inputs
- `story-writer/SplitStoryPicker.tsx:147,165`, `settings/general/page.tsx:67,124,179`,
  `activity-log/ActivityTable.tsx:89`, `command-palette/SubFlowForm.tsx:80`,
  `refinement-session/SavedSessionList.tsx:144`.

## Proposed approach

1. **Keyboard-enable clickable non-buttons.** Where it's really a button, make it one (or add
   `role="button"` + `tabIndex={0}` + Enter/Space) — copy `NavPanel.tsx:139`. For `BoardRow`, confirm
   the global shortcut scheme covers it and add row `tabIndex`/`aria` so it's announced and tabbable,
   or document the shortcut scheme as the intended a11y path.
2. **Add widget roles** to the shared primitives so they propagate: `TabBar` →
   tab/tablist/tabpanel/aria-selected; the shared `MenuItem` from
   [[BRDG-421-converge-buttons-and-menu-items]] → menu/menuitem + trigger `aria-haspopup`/`aria-expanded`;
   CommandPalette/SearchModal → combobox/listbox/option + `aria-activedescendant` (pair with the dialog
   migration in [[BRDG-422-unify-overlays-and-zindex-scale]]).
3. **Guarantee a focus indicator** on inline editors (shared with BRDG-420's field work).
4. **Headings/landmarks:** make the `ViewHeader` title a real `<h1>` (styled as today); wrap the
   persistent nav chrome in a `<nav aria-label>`.
5. **Label the unlabeled** selects/inputs (`aria-label` or visible `<label>`).

### Trade-offs

- Each fix is small and isolated; the value is highest on the shared primitives (TabBar, MenuItem,
  ViewHeader) because one change fixes many views. Lower-priority single-use offenders can be a long
  tail. No behaviour change for mouse users, so regression risk is low.

## Acceptance Criteria

- [ ] Board rows, child-issue rows, and pipeline filter controls are operable by keyboard (tab/enter
      or a documented shortcut scheme) and announce their role.
- [ ] `TabBar` exposes tab/tablist/tabpanel + `aria-selected`; menus expose menu/menuitem +
      `aria-haspopup`/`aria-expanded`; CommandPalette/SearchModal expose combobox/listbox/option.
- [ ] Inline editors show a visible focus indicator.
- [ ] Primary pages have a single `<h1>` (via `ViewHeader`) and a `<nav>` landmark.
- [ ] The listed selects/inputs have an accessible name.

## Tests

- [ ] Keyboard-interaction tests: Tab reaches a board row / child-issue row / filter control and
      Enter/Space activates it.
- [ ] Role tests for `TabBar`, the shared `MenuItem`, and the command palette listbox.
- [ ] A lightweight axe/role assertion on a couple of primary pages (one `h1`, labelled controls).

## Related

- [[BRDG-421-converge-buttons-and-menu-items]] — the shared `MenuItem` is where menu roles land.
- [[BRDG-422-unify-overlays-and-zindex-scale]] — dialog roles + combobox scaffolding.
- [[BRDG-420-consolidate-form-controls]] — inline-editor focus rings and input labels overlap.
- Touch points: `BoardRow.tsx`, `ChildIssueRow.tsx`, `pipelines/FilterBar.tsx`, `shared/TabBar.tsx`,
  `shared/ViewHeader.tsx`, `CommandPalette.tsx`, `SearchModal.tsx`, `EditableTitle.tsx`, the unlabeled
  selects.
