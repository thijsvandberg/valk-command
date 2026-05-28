# BRDG-217: Consolidate Remaining rgba() Color Values

**Status:** In Progress
**Priority:** Low
**Type:** Refactoring

## Description

Follow-up to BRDG-203. After the initial color token consolidation, ~137 `rgba()` values remain scattered across components. Most are brand-color variants at different opacities (e.g., `rgba(14,142,136,0.18)`) that should reference CSS variables.

### Key Files

- `src/components/sidebar/UserProfilePopover.tsx` - brand color rgba variants
- `src/app/(app)/pipelines/MetricsPanel.tsx` - 4 accent color rgba values
- `src/app/(app)/activity-log/StatsBar.tsx` - status color rgba values
- `src/components/shared/BusinessValuePicker.tsx` - button state rgba
- `src/components/shared/StoryPointPicker.tsx` - picker UI rgba
- `src/app/(app)/tickets/[key]/page.tsx` - epic color rgba
- `src/app/(app)/stakeholder/page.tsx` - shadow rgba

## Approach

1. Add opacity variants to existing CSS variables where needed (e.g., `--color-brand-500/18`)
2. For shadow-only rgba (black at various opacities), use the existing shadow token system
3. Replace inline rgba values with variable references

## Implementation Plan

**Strategy**: Use `color-mix(in srgb, var(--token) N%, transparent)` for inline styles and data constants. Use Tailwind v4 opacity modifiers (`bg-[var(--color-brand-500)]/10`) for className values. Add only 3 new CSS variables for patterns reused across 3+ files.

1. **Add CSS variables to globals.css**: `--color-drag-active`, `--color-brand-glow`, `--color-epic-subtle` (reused in 3+ files each)
2. **Replace brand-green rgba** (~40 occurrences): ViewHeader, Button, UserAvatar, UserProfilePopover, MetricsPanel, PipelineList, refinement page, ChatBubble, etc.
3. **Replace epic-purple rgba** (~15 occurrences): EpicPicker, EpicSuggestionCard, tickets page, StoryWriterLauncherModal
4. **Replace status-color rgba** (~30 occurrences): StatsBar, MetricsPanel, SprintStatPill, SprintStatsPopover, TicketRow, DevPanel
5. **Replace info-blue rgba** (~10 occurrences): LinkIssueDialog, SearchResultParts, AiInsightsPanel, BurnupChart
6. **Replace neutral/gray rgba** (~10 occurrences): BusinessValuePicker, StoryPointPicker, SprintStatPill
7. **Replace search-modal family rgba** (~20 occurrences): SearchModal, SearchModalFooter, SearchModalHeader, SearchModalSections, SearchFilterPanel
8. **Replace remaining component rgba**: CommandPalette, renderMarkdown, NotificationBell, ImageLightbox, etc.
9. **Leave black shadow rgba** (`rgba(0,0,0,...)` in box-shadow) mostly as-is since the shadow tokens themselves use this pattern

**Note**: `rgba(var(--color-brand-rgb, 0 0 0) / 0.06)` in SubtaskSuggestions and RelatedIssueSuggestions will be converted to `color-mix()` since `--color-brand-rgb` is never defined.

## Checklist

- [x] Audit all remaining rgba() values in .tsx files
- [x] Group by intent (brand opacity, status color, shadow)
- [x] Add CSS variable opacity variants where missing
- [x] Replace rgba values in MetricsPanel, StatsBar, UserProfilePopover
- [x] Replace rgba values in pickers (BusinessValue, StoryPoint)
- [x] Replace rgba values in page components
- [ ] Verify visual correctness in both themes
- [ ] All tests pass
