# BRDG-050: Story Writer Pane System

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want a flexible 1-3 pane layout in Story Writer where I can control how many panes are visible and which app (Chat, Editor, Diff, etc.) appears in each pane, so I can customize my editing workspace.

## Layout Structure

Three horizontal bars stacked top to bottom:

1. **Header** - Story writer action bar (split / save / push / discard). No changes to this bar.
2. **Application list bar** - Shows all available apps; click to toggle open/closed. Contains the pane count toggle (1 / 2 / 3).
3. **App toolbar** - One section per visible pane, showing the active app name and its context-specific actions. Example:

   ```
   [ CHAT  <actions: logs> ] | [ Editor: VPL-123 Title of the story  <actions> ] | [ Diff: Name/number draft  <actions: dropdown / preview> ]
   ```

## Apps and Default Panes

Each app opens in its own pane slot. Only one app can be active per pane at a time. When opened, apps land in their default pane by default; all apps start inactive until explicitly opened.

| App | Default pane |
|-----|-------------|
| Chat | Pane 1 |
| Editor | Pane 2 |
| Diff | Pane 3 |
| History | Pane 3 |
| Draft preview | Pane 3 |
| Related stories | Pane 3 |
| Story preview | Pane 3 |

## Draft Preview

Draft preview renders markdown content as a read-only formatted preview (no editor chrome). It can be opened from three entry points:

- **Diff view** - Toggle between diff and preview mode via an action in the app toolbar
- **History** - Open any historical version in preview mode
- **Chat** - When the AI proposes a draft suggestion, an "open" link appears next to it; clicking it opens that draft in Draft preview. From there the user can switch to Diff view to compare it against the current version.

## Acceptance Criteria

### Phase 1: Pane count toggle
- [x] Pane count toggle in the application list bar: buttons for 1, 2, 3
- [x] Toggling pane count shows/hides panes; app state in hidden panes is preserved
- [x] With 1 pane: only pane 1 visible; with 2 panes: pane 1 + 2; with 3 panes: all three
- [x] Viewport limit is not enforced automatically; the user controls the count manually

### Phase 2: Pane widths
- [x] Draggable dividers between panes to resize width
- [x] No minimum pane width enforced; panes can be dragged very narrow
- [x] Widths are stored as percentages so they survive viewport resize

### Phase 3: Application list bar
- [x] Bar lists all available apps (Chat, Editor, Diff, History, Draft preview, Related, Story preview)
- [x] All apps start inactive; clicking an app opens it in its default pane
- [x] Each app entry shows its current state: active in pane N, or inactive
- [x] Clicking an open app closes it (state is preserved, component stays mounted)
- [x] Chat is integrated into this bar; it opens in pane 1 instead of a sidebar, but looks visually identical to the current sidebar chat

### Phase 4: App toolbar
- [x] App toolbar renders one labeled section per visible pane
- [x] Each section shows the active app name (with context: e.g. ticket number + title for Editor, draft name for Diff) and its action buttons
- [x] Sections are separated by a visible divider
- [x] When a pane has no active app the section is empty or shows a placeholder

### Phase 5: Drag and drop
- [x] An active app can be dragged from its pane to another pane via the app toolbar section
- [x] Inactive apps can also be dragged from the application list bar; the entire app row acts as the drag handle (no separate icon)
- [x] When dragging, all panes (including empty/inactive ones) are shown as drop zones
- [x] Dropping an app on a pane makes it immediately active in that pane
- [x] The previously active app in the target pane becomes inactive (not destroyed; state preserved)

### Phase 6: State preservation
- [x] Closing or hiding a pane does not destroy app state (components stay mounted, hidden via CSS)
- [x] Re-opening an app restores scroll position, loaded data, and any in-progress edits
- [x] Last pane configuration (count, widths, app-to-pane mapping) is persisted in localStorage per story

## Technical Notes

- Use CSS Grid or Flexbox for pane layout; widths stored as percentages in context
- Pane state lives in a React context: pane count, active app per pane, app states
- Each app component is mounted lazily on first open and stays mounted (hidden via CSS) when inactive
- App toolbar sections are rendered from pane context; actions delegate to the active app component
- Drag and drop: use a lightweight drag library or pointer event handlers; the entire app row in the application list bar is draggable

## Out of Scope (for now)

- Floating or detachable panes
- Quick layout presets (Write / Review / Research)
- Pane configuration saved to database
