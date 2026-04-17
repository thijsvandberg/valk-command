# BRDG-112: Accessibility Audit

**Status:** Open
**Priority:** Medium

## Description

Many interactive elements use `div onClick` or `span onClick` instead of semantic `<button>` elements. This means no keyboard navigation (Tab + Enter/Space), no screen reader announcements, and no proper ARIA attributes. Rough count: ~150 clickable non-button elements across 80+ files.

### Examples of problematic patterns

**Clickable divs/spans used as buttons:**
- `styled span with onClick, no button element` in [src/components/stakeholder/CopyMarkdownButton.tsx:55](../../src/components/stakeholder/CopyMarkdownButton.tsx)
- `styled spans acting as radio buttons` in [src/components/chat/InvestigationInput.tsx:76-87](../../src/components/chat/InvestigationInput.tsx)
- `inline badge acting as button` in [src/components/NotificationBell.tsx:393](../../src/components/NotificationBell.tsx)
- `multiple filter chips as clickable divs` in [src/components/sprint-board/FilterBar.tsx](../../src/components/sprint-board/FilterBar.tsx)
- `slot actions as clickable divs` in [src/components/sprint-board/SprintSlots.tsx](../../src/components/sprint-board/SprintSlots.tsx)
- `7 onClick handlers on non-button elements` in [src/components/ticket-detail/DevPanel.tsx](../../src/components/ticket-detail/DevPanel.tsx)

**Missing focus states:**
- Some components use `focus-visible:outline-2 focus-visible:outline-offset-2`
- Others use `focus-visible:ring-2`
- Many have no focus style at all

## Acceptance Criteria

- [ ] Replace all div/span onClick interactive elements with `<button>` or `Button` component
- [ ] Add `aria-label` to all icon-only buttons
- [ ] Ensure all modals trap focus (tab does not escape modal)
- [ ] Consistent `focus-visible` ring across all interactive elements
- [ ] Add skip-to-content link in app layout
- [ ] Test keyboard navigation through main flows (sprint board, ticket detail, chat)

## Impact

Fixes ~150 non-semantic interactive elements across the codebase. After this audit, all clickable elements will be keyboard-navigable, screen-reader-accessible, and have consistent focus indicators, bringing the application up to baseline WCAG 2.1 compliance.
