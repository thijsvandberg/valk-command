# BRDG-460: Story Writer — Apps dropdown in header + single-row quick-prompt chips

**Status:** To Do
**Priority:** Medium
**Type:** Feature

## Description

Two changes that give the Story Writer chat more vertical room, chosen from the live
exploration at `/dev/exploration/story-writer-chrome`:

1. **Apps dropdown (direction C2).** The top toolbar bar that lists all 8 apps as toggle
   buttons (Chat, Editor, Diff, History, Draft preview, Related, Story preview, Meta)
   disappears. Instead, a single "Apps" button in the view header opens a dropdown that
   toggles panes open and closed. The second bar (the per-app toolbar with app labels,
   app-specific controls, and close buttons) stays exactly as it is. Net win: 44px of
   chrome, and the app list no longer duplicates the active-app tabs below it.
2. **Single scrolling chip row (direction 2).** The quick-prompt chips above the composer
   no longer wrap to two rows. They become one horizontally scrolling row of smaller
   chips with a right-edge fade. Each chip keeps its dual action: clicking the label
   fills the input, clicking the small send icon submits immediately. The cap of 5
   visible chips is dropped — all configured prompts show in the row (PO decision;
   this also fixes the known issue that newly added prompts could be silently invisible).

## Current Behaviour

- `src/components/story-writer/StoryWriterLayout.tsx` stacks two 44px bars between the
  `ViewHeader` and the pane area:
  - `src/components/story-writer/panes/ApplicationListBar.tsx` — all 8 apps as toggle
    buttons (`handleAppClick` calls `pane.openApp`/`pane.closeApp`), plus a conditional
    split-target button when `writer.targetTicketKey` is set. Each button is also a drag
    source. Hidden in focus mode (`if (focusMode) return null`).
  - `src/components/story-writer/panes/AppToolbar.tsx` — one section per visible pane
    showing the active app's label (drag source), app-registered controls, and a close
    button. Apps register real controls here via `registerToolbar` in
    `src/components/story-writer/panes/PaneContext.tsx` (e.g. `DiffApp` registers two
    version pickers + a diff/preview toggle; `EditorApp` registers a formatting-toolbar
    toggle and, in split mode, a Diff/Editor switch). Also hidden in focus mode.
- Pane state (`paneApps`, `paneVisible`, `paneWidths`) is managed by `PaneContext` and
  persisted per ticket in localStorage under `sw:${ticketKey}:panes`.
- The `ViewHeader` (`src/components/shared/ViewHeader.tsx`) is shared; `StoryWriterLayout`
  already fills its `actions` slot (review score, autosave indicator, Wrap up, more menu).
  It has no focus-mode handling, so it stays visible in focus mode.
- Quick chips live in `src/components/story-writer/StoryWriterChat.tsx`:
  - `MAX_VISIBLE_CHIPS = 5` (line ~160) and `getVisibleChips()` (~163-188) merge
    contextual chips (lead: "Find related", trail: "Review story") with API prompts from
    `/api/settings/quick-prompts`, then `.slice(0, MAX_VISIBLE_CHIPS)`.
  - The row (~579-625) uses `flex flex-wrap`, so at chat-pane width 5 chips wrap to two
    rows (~84px). Chip label button fills the input via `fillInput`; the split
    `SendHorizontal` button calls `handleDirectSend`. Both respect the prompt's
    `enableCodebase` flag.
  - The `QuickActionsPopover` in the composer footer already lists ALL actions
    unconditionally, so nothing is unreachable regardless of chip visibility.

## Proposed Approach

### 1. Apps dropdown in the view header

- New component `src/components/story-writer/panes/AppsMenu.tsx`: a header button
  ("Apps" with a grid icon and chevron) opening a dropdown listing all entries from the
  app definitions currently in `ApplicationListBar` (icon + label), plus the
  split-target entry when `writer.targetTicketKey` is set. Open apps show a brand-colored
  checkmark; clicking a row toggles `pane.openApp(id)` / `pane.closeApp(id)`. The menu
  stays open after a toggle (so several panes can be switched in one visit) and closes on
  outside click (`useOutsideClick`). Reuse the shared `MenuItem` primitive
  (`src/components/shared/MenuItem.tsx`) for the rows instead of hand-rolling.
- Mount the button in the `ViewHeader` `actions` cluster in `StoryWriterLayout.tsx`,
  left of the Wrap up button (placement as approved in the exploration mock).
- Remove the `<ApplicationListBar />` render from `StoryWriterLayout.tsx` and move
  `ApplicationListBar.tsx` (+ its test if any) to `deleted/` at the project root
  (project rule: never hard-delete).
- `AppToolbar` is untouched: per-app controls, close buttons, drag-to-move between panes
  and the drag expand-slots all keep working. Focus mode still hides `AppToolbar`; the
  Apps button hides together with the view header (`FocusModeWrapper` collapses
  `#view-header-portal`), which is parity with today where the app bar also hid.
- Known, accepted behaviour change: dragging a *not-yet-open* app into a specific pane is
  no longer possible (that drag started from the removed bar). Opening via the dropdown
  uses `openApp()`'s existing default placement; the app can then be dragged to another
  pane via its `AppToolbar` label as today.

### 2. Single scrolling chip row

- In `StoryWriterChat.tsx`, drop the cap: remove the `.slice(0, MAX_VISIBLE_CHIPS)` in
  `getVisibleChips()` (keep the lead → API prompts → trail ordering; remove the now-dead
  cap constant and its trail-dropping logic).
- Rework the chip row container: `flex-wrap` → single row with `overflow-x-auto`,
  hidden scrollbar (`[scrollbar-width:none]` + webkit variant), and a right-edge fade
  (`mask-image: linear-gradient(to right, black calc(100% - 40px), transparent)`).
- Shrink the chips one size: label `px-2 py-1 text-caption` (was `px-2.5 py-1.5
  text-label`), send segment `px-1.5` with `SendHorizontal size={8}` (was `px-2`,
  `size={9}`). Keep the split dual-action exactly as-is (fill vs direct send, disabled
  states, `enableCodebase` handling, `ctx-find-related` special case).
- No conditional visibility change: the row keeps rendering in all conversation states
  (the "chips only on empty conversation" direction was explicitly not chosen).

### Out of scope

- The standalone Chat view composer (`src/components/shared/ChatInput.tsx` /
  `QuickActionsPopover`) — untouched.
- The `/settings/prompts` page and the `/api/settings/quick-prompts` route (the max-20
  schema limit stays; the row simply shows whatever is configured).
- Pane persistence format (`sw:${ticketKey}:panes`) — unchanged.
- Focus mode behaviour — unchanged apart from there being one bar less to hide.

## Implementation Plan

1. **AppsMenu component**: new `src/components/story-writer/panes/AppsMenu.tsx`. App defs
   copied from `ApplicationListBar.tsx` (the bar file moves to `deleted/`). Trigger: ghost
   `Button` with `LayoutGrid` icon + "Apps" + rotating `ChevronDown`, `aria-expanded`.
   Dropdown: `MenuList`/`MenuItem` from `src/components/shared/MenuItem.tsx` (no trailing
   slot prop, so the checkmark renders inside `children` after a `flex-1` label span),
   positioned `absolute right-0 top-full z-30`. Open-state via `pane.paneApps.indexOf` +
   `pane.paneVisible`; row click toggles `openApp`/`closeApp` WITHOUT closing the menu;
   `useOutsideClick` (handles Escape too) closes it. No `useEffect` needed. Co-located
   `AppsMenu.test.tsx` mocking `usePaneContext`/`useWriterContext`.
2. **Mount + remove bar**: in `StoryWriterLayout.tsx` insert `<AppsMenu />` in the
   ViewHeader actions between the autosave indicator block and the (conditional) Wrap up
   block, rendered unconditionally; drop the `ApplicationListBar` import and render
   (line ~492); `AppToolbar` untouched. Move `ApplicationListBar.tsx` to `deleted/`
   (gitignored: file stays on disk, git records the deletion). `pane.draggedApp` stays
   live (AppToolbar label drags + PaneArea drops) — no dead code in `PaneContext`.
3. **Layout tests**: in `StoryWriterLayout.test.tsx` remove the dead ApplicationListBar
   mock, add an `AppsMenu` mock (the real one would crash on the thin `usePaneContext`
   mock), assert the Apps button renders inside `view-header-actions`, precedes Wrap up in
   DOM order, and still renders for still-draft tickets (where Wrap up is absent).
4. **Chip row**: in `StoryWriterChat.tsx` delete `MAX_VISIBLE_CHIPS` (verified: no other
   importers) and the `.slice(...)` in `getVisibleChips`; fix the stale cap comment on
   `ctx-review-story`. Row container: `flex-wrap` → `overflow-x-auto` +
   `[scrollbar-width:none]`/webkit-hidden + right fade `mask-image`; keep a small `min-h`
   so the composer doesn't jump at zero chips. Chips: `shrink-0`, label
   `px-2 py-1 text-caption whitespace-nowrap`, send segment `px-1.5` `size={8}`; all
   behaviour (fill vs direct send, enableCodebase, ctx-find-related, disabled states)
   unchanged. Update the three cap-asserting tests in `StoryWriterChat.test.ts`
   (no-cap totals; trailing review always last; BRDG-435 Investigate test simplified) and
   add a row-markup render test in `StoryWriterChat.render.test.tsx`.
5. **Docs**: `docs/architecture/story-writer.md` has no chrome section yet — add one under
   UI Components (Apps dropdown, single AppToolbar bar, scrolling chip strip) and an
   `AppsMenu` row in the component table.
6. **Verify**: lint + typecheck per step, `npx vitest run` on changed test files, then
   `npm run verify` + `npm run build` + browser check via sprint board navigation.

## Acceptance Criteria

- [x] The Story Writer no longer renders the 8-app toggle bar; between the view header and the panes only the per-app toolbar remains. <!-- StoryWriterLayout.tsx: remove <ApplicationListBar />; ApplicationListBar.tsx moved to deleted/ -->
- [x] The view header shows an "Apps" button (left of Wrap up) that opens a dropdown listing all 8 apps with icons; open apps show a checkmark. <!-- new panes/AppsMenu.tsx, mounted via ViewHeader actions in StoryWriterLayout.tsx -->
- [x] Clicking a dropdown row toggles that pane open/closed via the existing pane logic; the menu stays open for multiple toggles and closes on outside click. <!-- AppsMenu.tsx using pane.openApp/closeApp + useOutsideClick -->
- [x] When split mode is active, the dropdown also lists the split-target entry (ticket key + scissors icon), like the old bar did. <!-- AppsMenu.tsx, writer.targetTicketKey branch mirroring the old ApplicationListBar -->
- [x] The per-app toolbar keeps all current behaviour: app labels, app-registered controls (Diff version pickers, Editor formatting toggle), close buttons, drag-to-move. <!-- AppToolbar.tsx untouched -->
- [x] Focus mode behaviour is unchanged: the per-app toolbar still hides; the Apps button hides with the view header (as the old bar did) and returns on focus-mode exit. <!-- AppToolbar.tsx focusMode check unchanged; FocusModeWrapper collapses #view-header-portal, verified during planning -->
- [x] The quick-prompt chips render as ONE non-wrapping row that scrolls horizontally with a hidden scrollbar and a right-edge fade. <!-- StoryWriterChat.tsx chip row container, data-testid="quick-chip-row" -->
- [x] Chips are one size smaller but keep the dual action: label fills the input, the send segment submits immediately; disabled states and enableCodebase behaviour unchanged. <!-- StoryWriterChat.tsx chip buttons -->
- [x] The 5-chip cap is gone: all configured prompts for the issue type (plus contextual chips in lead/trail order) appear in the row. <!-- getVisibleChips in StoryWriterChat.tsx, slice + MAX_VISIBLE_CHIPS removed -->
- [x] `docs/architecture/story-writer.md` reflects the new chrome (Apps dropdown, single bar). <!-- Chrome subsection added under UI Components -->

## Tests

- [x] `getVisibleChips` returns all prompts (no cap) and preserves lead → API → trail ordering with >5 prompts. <!-- StoryWriterChat.test.ts, cap tests rewritten -->
- [x] Chip row renders non-wrapping scroll container; chip label click fills input, send segment click sends immediately. <!-- StoryWriterChat.render.test.tsx, BRDG-460 describe block -->
- [x] AppsMenu renders all 8 apps, checkmarks on open apps, toggles openApp/closeApp on click, includes split-target when targetTicketKey is set. <!-- new panes/AppsMenu.test.tsx -->
- [x] StoryWriterLayout renders the Apps button and no ApplicationListBar. <!-- StoryWriterLayout.test.tsx -->

## Related

- Exploration: `/dev/exploration/story-writer-chrome` (direction C2 + direction 2 chosen; sections 1-2).
- [[BRDG-459-consolidate-story-writer-error-surfaces]] — same layout file (`StoryWriterLayout.tsx`); coordinate if implemented in parallel.
- Memory note `project_quick_prompt_chip_visibility` — the silent-invisibility footgun this story removes; update the note after implementation.
- `docs/architecture/story-writer.md` — pane system reference.
