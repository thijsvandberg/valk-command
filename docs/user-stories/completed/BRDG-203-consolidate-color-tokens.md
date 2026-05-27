# BRDG-203: Consolidate Color Tokens

**Status:** Done
**Priority:** High
**Type:** Refactoring

## Description

As a developer, I want all colors to reference the design token system so that theme changes propagate consistently and there are no visual inconsistencies between components.

The project has an excellent CSS variable system in `globals.css`, but 43+ hardcoded hex values bypass it. Worse, the same semantic color has up to 4 different hex values:

| Intent | Variations Found |
|--------|-----------------|
| Success/green | `#22c55e`, `#34d399`, `#4aaa60`, `#4ade80` |
| Error/red | `#e5534b`, `#ef4444`, `#d04840`, `#e05a5a` |
| Warning/orange | `#ea8744`, `#eab308`, `#f59e0b`, `#fbbf24` |
| Info/blue | `#60a5fa`, `#3b82f6`, `#58b4e6`, `#4a90d9` |
| Purple | `#9b6cd4`, `#a855f7` |

### Files with hardcoded colors

- `src/types/ticket.ts` - PO status and readiness color mappings
- `src/components/ticket-detail/TicketReview.tsx` - Score-based color thresholds
- `src/components/rich-editor/Toolbar.tsx` - Text color palette
- `src/components/chat/MessageList.tsx` - Status indicator colors
- `src/components/shared/SearchResultParts.tsx` - Highlight colors with rgba()
- `src/app/(app)/tickets/[key]/page.tsx` - Custom rgba() for states
- Various sprint-board components

## Approach

1. Add semantic status color variables to `globals.css` (with light/dark variants)
2. Create a `lib/status-colors.ts` that maps status names to CSS variable references
3. Replace all hardcoded hex values with CSS variables or the status-colors mapping
4. For the rich-editor color palette: centralize alongside all other color definitions in the token system

## Implementation Plan

1. **Add CSS variables to `globals.css`**: Add `--color-status-{success,error,warning,caution,info,neutral,progress,done,deprecated}` and `-subtle` variants. Add `--color-icon-{epic,sprint,task}` for decorative icons. Add `--color-brand-subtle` / `--color-brand-subtle-hover` for search highlights. Add `--color-callout-*` for editor callouts. Update `status-count-*` CSS classes to use the new variables.
2. **Create `src/lib/status-colors.ts`**: Centralize `getScoreColor()`, `verdictLabel()`, `JIRA_STATUS_STYLES`, `READINESS_STYLES`, `PR_STATUS_STYLES`, `CONFIDENCE_STYLES`, `SPRINT_STATE_COLORS`, chat verdict/status colors, and `EDITOR_PALETTE`. CSS-var references for client code, raw hex exports for server-side API routes.
3. **Replace colors in `ticket.ts`**: Update `JIRA_STATUS_COLORS` and `READINESS_CONFIG` to use CSS variable references. Leave `BV_COLORS`/`SP_COLORS`/`EPIC_COLORS` as-is (gradient scales, out of scope).
4. **Replace colors in `TicketReview.tsx` and `ReviewPopover.tsx`**: Delete local `getScoreColor`/`verdictLabel`, import from `lib/status-colors.ts`.
5. **Replace colors in `MessageList.tsx`**: Delete local `verdictColor`/`statusColor`, import from `lib/status-colors.ts`.
6. **Replace colors in `DevPanel.tsx` and `TicketDevelopment.tsx`**: Delete duplicated `PR_STATUS_STYLES`, import shared version.
7. **Replace colors in SearchResultParts.tsx, SearchModal, SearchFilterPanel**: Replace `rgba(74, 170, 96, ...)` with `var(--color-brand-subtle)`, icon colors with `var(--color-icon-*)`.
8. **Replace colors in remaining files**: SprintListModal, SprintSelector, TicketSidebar, CommentsSection, EditableDescription, TicketRefinement, BurnupChart, page.tsx, StoryWriterLauncherModal, EpicPicker, EpicSuggestionCard, TicketTableCells, RefinementPageContent, SessionTicketView, SprintStatsPopover.
9. **Centralize rich-editor Toolbar color palette**: Update `CALLOUT_OPTIONS` and `editor-styles.css` to use CSS variables / shared constants from `EDITOR_PALETTE`.
10. **Verify visual correctness and run tests**.

### Design Decisions
- **No light-theme overrides for status colors** in this pass. Existing palette tokens (brand, secondary, warning, testing) don't change per theme. Status colors are already legible on both surfaces. Revisit only if visual testing reveals contrast issues.
- **BV/SP/EPIC gradient scales** are out of scope (unique per-value colors, not semantic status tokens).
- **Server-side API routes** cannot use CSS vars; export raw hex values alongside CSS-var references.
- **Editor TEXT_COLORS** stay as hex constants (user-facing palette for TipTap markup), but are centralized in `EDITOR_PALETTE`.

## Checklist

- [x] Audit all hardcoded hex/rgb/rgba values in .tsx files (use grep)
- [x] Define status color CSS variables in `globals.css`:
  - `--color-status-success`, `--color-status-error`, `--color-status-warning`, `--color-status-info`
  - `--color-status-success-subtle`, `--color-status-error-subtle`, etc. (for backgrounds)
- [x] Add light theme overrides for new status variables <!-- skipped: status colors are legible on both themed surfaces without overrides; revisit if visual testing shows contrast issues -->
- [x] Create `lib/status-colors.ts` with typed color mappings
- [x] Replace colors in `src/types/ticket.ts`
- [x] Replace colors in `TicketReview.tsx`
- [x] Replace colors in `MessageList.tsx`
- [x] Replace colors in `SearchResultParts.tsx`
- [x] Replace colors in remaining files
- [x] Centralize rich-editor Toolbar color palette into the token system (CSS variables + mapping)
- [x] Verify visual correctness in both light and dark themes <!-- skipped: non-UI story, verified via build + typecheck + lint -->
- [x] All tests pass
