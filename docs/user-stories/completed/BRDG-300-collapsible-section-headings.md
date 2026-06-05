# BRDG-300: Collapsible Section Headings (Remembered Across Surfaces)

**Status:** Complete
**Priority:** Medium
**Type:** Enhancement

## Description

As a PO, I want to collapse the section headings inside a ticket (Attachments, Subtasks,
Linked Issues, PO Comments, Jira Comments, etc.) by clicking on the heading, so I can hide
sections I rarely use and keep the ticket focused.

The collapse choice must be **remembered per heading and shared across every place a ticket
is shown**: the full ticket single view, the refinement session ticket view, and the
sprint-board side panel. So if I collapse **Comments** once, comments are then collapsed by
default on every ticket, in every one of those surfaces, until I expand them again.

Collapse state is **per heading, not per ticket** — it is a global default for that section
type, not a property of an individual ticket.

## Why

The ticket body is long and the same sections appear on every ticket. A PO who never uses,
say, Jira Comments or Attachments has to scroll past them on every ticket, in every view.
Letting them collapse a section once and have it stay collapsed everywhere removes that
repeated friction.

## Current behaviour (for reference)

- Most section headings render through a shared, **non-collapsible** component
  `SectionHeader` (`src/components/shared/SectionHeader.tsx`). It shows the title, an
  optional count badge, and optional action buttons. There is no toggle.
- `SectionHeader` is used for: Attachments (`AttachmentsSection.tsx`), Subtasks / Epic
  Children (`ChildIssueListHeader.tsx`), Linked Issues (`LinkedIssuesSection.tsx`),
  PO Comments + Jira Comments (`CommentsSection.tsx`), and Confluence
  (`ConfluencePagesSection.tsx`).
- The three surfaces that render these sections:
  1. **Full ticket single view** -> `TicketTabContent.tsx` (Content tab).
  2. **Refinement session** -> `refinement-session/SessionTicketView.tsx`.
  3. **Sprint-board side panel** -> `SidePanel.tsx`, which also renders `TicketTabContent`.
- A few one-off collapse behaviours already exist but are **local-only (reset on reload)**
  and inconsistent: `CollapsibleComments` in the refinement session, and the "PO Note" /
  "More details" toggles in `TicketMetaContent.tsx`.
- Persistence precedent in the codebase:
  - Simple client UI prefs use the `useLocalStorage` hook (e.g. `ticket-sidebar-collapsed`,
    `sprintBoardMetaCollapsed`) — this is the established pattern for collapse/width state.
  - There is also a DB-backed pattern (`appSetting` table + `/api/settings/section-visibility`
    + `useSectionVisibility`) used for field-visibility preferences.

## Decisions to confirm with PO

- **Default state:** every section starts **expanded**; collapsing is opt-in per heading.
  (Matches the request: collapsing a heading sets the new default everywhere.)
- **Persistence mechanism:** use **`localStorage`** (one key holding a map of
  `headingTitle -> collapsed`). Rationale: single-user app, this is exactly the kind of UI
  preference the existing collapse keys use, and it is the lightest option. Trade-off: the
  preference lives per browser/device, so it would not follow the PO to a different machine.
  *(Alternative: store in the `appSetting` DB table so it follows the user across devices.
  Slightly more work; flag if cross-device sync matters.)*
- **Keying:** sections are keyed by their **heading title string** (e.g. `"PO Comments"`,
  `"Jira Comments"`, `"Subtasks"`), since that is what makes "collapse Comments everywhere"
  work regardless of which surface rendered it.

## Requirements

### 1. Headings become collapsible

- Each `SectionHeader`-based section gets a collapse affordance: clicking the heading row
  (and a chevron indicator) toggles the section's body open/closed.
- Collapsed = heading stays visible (with its count badge), body is hidden. Action buttons
  in the header (filter, AI-suggest, etc.) remain reachable when expanded.
- A chevron rotates to indicate state (reuse the existing `ChevronDown`/`-rotate-90`
  pattern already used by the PO Note / More-details toggles for visual consistency).

### 2. State is remembered per heading

- Collapsing a heading persists that choice. On next load, that section is collapsed by
  default.
- State is stored once, keyed by heading title, and applies to **all** instances of that
  heading.

### 3. State is shared across all three surfaces

- Collapsing **Comments** (or any section) in the refinement session also collapses it on
  the full ticket single view and in the sprint-board side panel, and vice versa.
- The covered headings are at least: Attachments, Subtasks / Epic Children, Linked Issues,
  PO Comments, Jira Comments, Confluence. (Description/Title are out of scope — see below.)

### 4. Consistent behaviour and styling

- The toggle looks and behaves the same in every surface (same chevron, same hover/focus/
  active states, `cursor: pointer`, keyboard-accessible with `aria-expanded`).
- Replace the existing one-off `CollapsibleComments` behaviour in the refinement session so
  Comments uses the same shared, persisted mechanism (no competing local-only toggle).

## Suggested implementation (for the agent)

- Add a `useSectionCollapsed()` hook backed by a single `useLocalStorage` map
  (e.g. key `bridge:section-collapsed` = `{ "PO Comments": true, ... }`), exposing
  `isCollapsed(title)` and `toggle(title)`.
- Extend `SectionHeader` with optional `collapsible`, `collapsed`, and `onToggle` props
  (default off, so non-collapsible usages are unaffected), plus the chevron + `aria-expanded`.
- Wrap each section's body so it renders only when not collapsed. Prefer a small shared
  `CollapsibleSection` wrapper over editing every section component ad hoc, to keep the
  three surfaces consistent.
- Wire the hook into the sections rendered by `TicketTabContent`, `SessionTicketView`, and
  (via `TicketTabContent`) `SidePanel`.

## Out of scope

- The Title and Description blocks (not `SectionHeader`-based, always-visible editing area).
- The meta-sidebar field toggles (`useSectionVisibility`) and the meta panel's own
  collapse/resize (BRDG-260) — different mechanism, leave untouched.
- Per-ticket collapse (this is a global per-heading default, by design).
- Animated expand/collapse height transitions are optional polish, not required.

## Implementation Plan

### Phase A — Store and hook (foundation)
1. `src/lib/section-collapse-store.ts`: module-level `Map<string, boolean>` of collapsed
   keys + a `version` counter + listener set, backed by localStorage key
   `bridge:section-collapsed`. Mirrors `epic-color-registry.ts`. `getSnapshot()` returns the
   **version number** (NOT the map — returning a fresh object would infinite-loop
   `useSyncExternalStore`). `getServerSnapshot()` returns constant `0`. Pure reader
   `isCollapsed(key)`, mutators `toggle(key)` / `setCollapsed(key, val)` (persist + emit),
   one window `storage` listener attached once (guarded) for cross-tab, and a test-only
   `__resetSectionCollapseStore()`. Exported key constants.
2. `src/hooks/useSectionCollapsed.ts`: `useSyncExternalStore(subscribe, getSnapshot,
   getServerSnapshot)`, returns `{ isCollapsed(key), toggle(key) }`. Collapsed-on-load
   sections flash expanded for one frame (constant server snapshot) — accepted, matches
   existing `useLocalStorage` behaviour.

### Phase B — SectionHeader
3. Extend `SectionHeader` with optional `sectionKey` + `children`. With `sectionKey`: the
   chevron + title + count become a `<button>` (`aria-expanded`, hover/focus-visible/active,
   cursor pointer) that toggles; `actions` stay OUTSIDE the button (no nested buttons) and
   are hidden when collapsed; `children` not rendered when collapsed; count stays visible.
   Without `sectionKey`: identical DOM to today (backward compatible — SprintListModal,
   SprintOverviewCard untouched).

### Phase C — Simple sections (children model)
4. `AttachmentsSection` (key `attachments`, both empty/non-empty branches),
   `CommentsSection` (`po-comments` + nested Jira `jira-comments`), `LinkedIssuesSection`
   (`linked-issues`; Suggest stays as `actions`), `ConfluencePagesSection` default variant
   (`confluence`, leave compact variant's bespoke toggle alone): pass `sectionKey`, move body
   into `SectionHeader` children.

### Phase D — List sections (self-hide model)
5. `ChildIssueListHeader`: forward a `sectionKey` prop to `SectionHeader`.
6. `SubtasksSection` (`subtasks`) and `EpicChildrenSection` (`epic-children`): read
   `useSectionCollapsed().isCollapsed(key)` and gate their own complex body (DnD/bulk/modals)
   on `!collapsed`.

### Phase E — Refinement
7. `SessionTicketView` `CollapsibleComments`: drop local `useState(true)`, use shared hook
   keyed `jira-comments` (shares with full-view Jira Comments); rewire chevron/aria.

### Phase F — Keys + tests
8. Centralize section-key constants in the store file; CommentsSection and SessionTicketView
   import the same `jira-comments` constant.
9. Tests: store/hook unit (default expanded, toggle+persist, cross-instance share, reset);
   SectionHeader collapsible (chevron, aria-expanded, body+actions hide on collapse, count
   stays, non-collapsible DOM unchanged); cross-surface shared-state. Add
   `afterEach(__resetSectionCollapseStore)` + `localStorage.clear()` in new test files to
   avoid module-level state leakage.

## Acceptance Criteria

- [x] Clicking a section heading collapses/expands its body on all three surfaces.
- [x] Collapsing a heading on one surface makes it collapsed by default on the other two.
- [x] Collapse state survives a page reload.
- [x] Default state for every section is expanded until the PO collapses it.
- [x] Headings remain non-collapsible only where intended (Title/Description untouched).
- [x] The refinement session's old local-only Comments toggle is replaced by the shared one.
- [x] Toggle has hover/focus-visible/active states, `cursor: pointer`, and `aria-expanded`.
- [x] Tests cover the hook (persist + read), `SectionHeader` toggle rendering, and the
      cross-surface shared-state behaviour.

> Note: the refinement session's combined "Comments" toggle is keyed `jira-comments`, so it
> shares state with the full view's "Jira Comments" section (both surface Jira comments). The
> Bridge-only "PO Comments" section has its own `po-comments` key.

## Testing

- Unit test `useSectionCollapsed` (reads default, toggles, persists to the shared key).
- Component test `SectionHeader` collapsible mode (chevron state, `aria-expanded`, body
  show/hide on toggle).
- Test that two sections with the same title reflect one shared collapsed state.
- Run `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` before commit.
