# BRDG-425: Accessibility baseline pass (keyboard + roles on primary views)

**Status:** Done
**Priority:** Medium
**Type:** Accessibility — keyboard nav, widget roles, focus, landmarks

## Status (run note)

Shipped to `dev` in additive slices (no behaviour change for mouse users):

- **Shared primitives + landmarks** — `ViewHeader` title is now a real `<h1>` and
  the nav trigger is wrapped in a `<nav aria-label="Primary">` landmark; the two
  content `<h1>`s that then collided (stakeholder sprint card, story-preview pane)
  were demoted to `<h2>` so every primary page keeps a single `<h1>`. `TabBar`
  exposes tablist/tab + `aria-selected`; the ticket-detail tab strip (bare `<Tab>`)
  got `role=tablist` + `role=tabpanel`. The shared `MenuItem`/`MenuList` default to
  `role=menuitem`/`role=menu`.
- **Keyboard rows** — `ChildIssueRow` is now a real keyboard button (role + tab
  order + Enter/Space, keydown guarded to the row). `BoardRow` announces via
  `aria-label` + `aria-selected`; the board is a roving-focus grid (TicketTable
  `tabindex=0`, Arrow/Enter via `useSprintBoardShortcuts`) — the documented a11y
  path, since per-row tab stops would flood a long virtualized list and a row
  `onKeyDown` would fight @dnd-kit's Enter/Space. Pipelines/Epics filter backdrops
  are `aria-hidden` (the triggers/options were already buttons).
- **Menus** — StakeholderOverflowMenu and the ticket action menu expose
  `role=menu` on their panels and `aria-haspopup`/`aria-expanded` on triggers.
- **Combobox** — CommandPalette (full: combobox + listbox + option +
  `aria-activedescendant`) and SearchModal (combobox + listbox + option +
  `aria-selected`) over the BRDG-422 dialog.
- **Labels** — accessible names on the listed selects/inputs (settings, sub-flow,
  split-story, saved-session rename, activity-log status filter).
- **Conditional-className buttons (folded-in scope)** — added focus rings to the
  buttons that truly lacked one and lowered the `menu-button-guard` ratchet 16 -> 7
  (residual 7 are documented heuristic false positives).
- **Tests** — role assertions (TabBar, MenuItem, CommandPalette listbox), keyboard
  activation (ChildIssueRow Enter/Space), and landmark/heading checks (ViewHeader
  single `<h1>` + `<nav>`). Verified in Chrome (dark): one `<h1>` + `Primary` nav on
  board / ticket-detail / pipelines, ticket-detail tablist+4 tabs, no console errors.
- **Inline-editor focus indicators** — already shipped by BRDG-420 (confirmed
  present, `focus-ring-guard.test.ts` kept green); no new work needed.
- **Deferred / not pursued:** the long-tail single-use clickable divs that embed
  their own interactive children (story-writer chat-message body, VersionList row
  with a nested preview button, activity-log expandable row with nested actions)
  need a restructure beyond a baseline pass and were left documented. SearchModal
  `aria-activedescendant` is partial (CommandPalette has the full wiring).

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

- [x] Board rows, child-issue rows, and pipeline filter controls are operable by keyboard (tab/enter
      or a documented shortcut scheme) and announce their role.
- [x] `TabBar` exposes tab/tablist/tabpanel + `aria-selected`; menus expose menu/menuitem +
      `aria-haspopup`/`aria-expanded`; CommandPalette/SearchModal expose combobox/listbox/option.
- [x] Inline editors show a visible focus indicator (shipped by BRDG-420; confirmed).
- [x] Primary pages have a single `<h1>` (via `ViewHeader`) and a `<nav>` landmark.
- [x] The listed selects/inputs have an accessible name.

## Tests

- [x] Keyboard-interaction tests: `ChildIssueRow` role=button + tab order + Enter/Space activation
      (board row uses the documented roving-grid scheme; control reachability checked in Chrome).
- [x] Role tests for `TabBar` (tablist/tab/aria-selected), the shared `MenuItem` (role=menuitem), and
      the command palette listbox (combobox/listbox/option).
- [x] Role/landmark assertions on `ViewHeader` (single `<h1>` + `<nav>`); labelled-control checks in
      the stakeholder/settings suites. Chrome-verified one `<h1>` + nav on the primary pages.

## Related

- [[BRDG-421-converge-buttons-and-menu-items]] — the shared `MenuItem` is where menu roles land.
- [[BRDG-422-unify-overlays-and-zindex-scale]] — dialog roles + combobox scaffolding.
- [[BRDG-420-consolidate-form-controls]] — inline-editor focus rings and input labels overlap.
- Touch points: `BoardRow.tsx`, `ChildIssueRow.tsx`, `pipelines/FilterBar.tsx`, `shared/TabBar.tsx`,
  `shared/ViewHeader.tsx`, `CommandPalette.tsx`, `SearchModal.tsx`, `EditableTitle.tsx`, the unlabeled
  selects.
