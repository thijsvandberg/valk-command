# BRDG-133: Dark / Light Mode

**Status:** In Progress
**Priority:** Low

## Description

As the PO, I want to switch between dark and light mode so the interface is comfortable to use in different lighting conditions (e.g. daytime meetings, bright offices, late-night work).

## Current State

The app is hardcoded to dark mode. All colors use CSS custom properties (`--color-*`) defined in `globals.css` under `:root`, with no light-mode variants. There is no theme provider, toggle, or persistence mechanism.

## Implementation Plan

1. **CSS variables and semantic tokens** (`globals.css`)
   - Keep palette tokens (brand/secondary/warning/testing 50-950) unchanged in `@theme`
   - Add new semantic tokens to `@theme`: `--color-text-primary`, `--color-text-secondary`, `--color-text-tertiary`, `--color-text-muted`, `--color-icon-default`, `--color-icon-muted`, `--color-overlay-subtle/default/strong`
   - Move surface/border/hover variables into `[data-theme="dark"]` and `[data-theme="light"]` selectors
   - Define light-mode surface values (base: `#f8f9fb`, elevated: `#ffffff`, floating: `#ffffff`)
   - Light borders use `rgba(0,0,0,...)`, light hovers use `rgba(0,0,0,...)`
   - Add `color-scheme: dark/light` per theme selector

2. **Flash prevention + layout** (`layout.tsx`)
   - Add `data-theme="dark"` to `<html>` as default
   - Insert inline `<script>` in `<head>` to read localStorage/system preference before paint
   - Change viewport `colorScheme` to `"dark light"`

3. **ThemeProvider context** (`src/contexts/ThemeContext.tsx`)
   - `useSyncExternalStore` pattern (like Sidebar collapse)
   - Exports: `ThemeProvider`, `useTheme()` -> `{ theme, setTheme, toggleTheme }`
   - Syncs `data-theme` attribute + `color-scheme` CSS + `<meta name="theme-color">`
   - Listens to `prefers-color-scheme` changes when no stored preference

4. **Migrate all components** from `text-white/XX` / `bg-white/[XX]` to semantic tokens
   - `text-white/80-90` -> `text-text-primary`
   - `text-white/50-70` -> `text-text-secondary`
   - `text-white/30-45` -> `text-text-tertiary`
   - `text-white/10-25` -> `text-text-muted`
   - `bg-white/[0.02-0.04]` -> `bg-overlay-subtle`
   - `bg-white/[0.05-0.07]` -> `bg-overlay-default`
   - `bg-white/[0.08+]` -> `bg-overlay-strong`
   - `border-white/[XX]` -> existing `border-border-*` tokens
   - Inline `rgba(255,255,255,...)` in style objects -> CSS variable references
   - Batch by component area: shared UI -> layout -> views

5. **Toggle UI** (`UserProfilePopover.tsx`)
   - Remove `disabled: true` / "Coming soon" from theme menu item
   - Wire action to `toggleTheme()`, swap Moon/Sun icon per current theme
   - Add `theme-transition` class approach for smooth 200ms switch

6. **Polish**: status badges, noise overlay, editor-styles.css, charts (BurnupChart), code blocks

## Acceptance Criteria

### Phase 1: Theme infrastructure
- [x] Define a complete set of light-mode values for all `--color-*` variables in `globals.css`
- [x] Apply dark/light variables via a class or data attribute on `<html>` (e.g. `data-theme="dark"`)
- [x] Create a `ThemeProvider` context that manages the active theme
- [x] Persist the selected theme in `localStorage`
- [x] Default to system preference (`prefers-color-scheme`) when no stored preference exists
- [x] Update `color-scheme` meta/CSS to match the active theme

### Phase 2: Toggle UI
- [x] Add a theme toggle button in the top navigation / settings area
- [x] Toggle shows current mode and switches instantly without page reload
- [x] Smooth transition when switching (e.g. `transition: background-color 200ms`)

### Phase 3: Polish
- [x] Verify all views render correctly in light mode (Dashboard, Chat, Sprint Board, Story Writer, Test Center, Refinement, Scheduled Jobs, Stakeholder)
- [x] Ensure charts, graphs, and code blocks are legible in both modes
- [x] Ensure sufficient contrast ratios (WCAG AA) for text and interactive elements in both modes
- [x] Images and icons remain visible in both modes (no white-on-white or black-on-black)

## Technical Notes

- The existing `--color-*` system is comprehensive, so light mode is primarily a matter of defining alternate values rather than restructuring CSS
- Use a `data-theme` attribute on `<html>` and scope variable overrides under `[data-theme="light"]`
- Keep `dark` as the default to avoid flash-of-wrong-theme for existing users
- The Stakeholder View should respect its own theme preference independently (external users may prefer light mode)

## Out of Scope

- Per-view theme overrides (e.g. Dashboard dark while Chat is light)
- Custom user-defined color palettes
- High-contrast or accessibility-specific themes (separate story)
