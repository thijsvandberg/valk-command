# BRDG-070: Contextual Help and Tooltips

**Status:** Open
**Priority:** Low

## Description

As the PO, I want contextual help tooltips on quality scores, PO statuses, and sync indicators explaining what they mean and what actions I can take so the app is self-documenting.

## Acceptance Criteria

### Phase 1: Info tooltips on key concepts
- [ ] Quality score: tooltip explaining the 0-100 scale, what factors influence it, when to re-run
- [ ] PO status values: tooltip on each status explaining its meaning (Draft, Ready, Needs Work, etc.)
- [ ] Stale indicator: tooltip explaining why a score is stale and how to refresh
- [ ] Sync indicator: tooltip showing last sync time, next scheduled sync, current status

### Phase 2: Info icons
- [ ] Small info icon (Lucide `Info` or `HelpCircle`) next to complex fields
- [ ] Hover triggers the tooltip (not click, to avoid blocking interactions)
- [ ] Tooltip positioned to avoid overflow (auto-placement)
- [ ] Consistent style: muted icon, informative tooltip with max 2-3 sentences

### Phase 3: Column header help
- [ ] Sprint Board column headers with help tooltips
- [ ] Explain what each column shows and how it's calculated
- [ ] Link to documentation (if exists) from tooltip

## Technical Notes

- Reuse existing `Tooltip` component from shared components
- Keep tooltip text concise (max 150 characters per tooltip)
- Store tooltip content in a central config/constants file for easy updates
- Ensure tooltips are accessible (aria-describedby, keyboard-focusable info icons)

## Out of Scope (for now)
- Full documentation system
- Video explainers
- Interactive tutorials
- AI-powered help ("ask about this field")
