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

## Implementation Plan

1. **AC3 (Modal focus trap)** - Update `Modal.tsx` to add `role="dialog"`, `aria-modal="true"`, auto-focus first focusable element on open, trap Tab/Shift+Tab within modal, restore focus on close. Update `Modal.test.tsx` with trap tests.

2. **AC1 (Semantic button conversion)** - Convert 8 `role="button"` div/span instances to `<button type="button">` across 5 files:
   - `DevPanel.tsx:311` - section header toggle div → button with `aria-expanded`
   - `ConfluencePagesSection.tsx:326` - section header toggle div → button with `aria-expanded`
   - `SprintListModal.tsx:242` - sprint list item div → button
   - `StoryWriterLauncherModal.tsx:607` - session card div → button (keep cardRefs, keep arrow-key handler)
   - `TicketTable.tsx:634,645,656` - 3 filter badge spans → buttons with `aria-pressed`

3. **AC2 (aria-label on icon-only buttons)** - Add `aria-label` to icon-only buttons that have `title` but no `aria-label`. Copy `title` value as `aria-label` for all icon-only `Button` usages across the codebase.

4. **AC4 (focus-visible ring consistency)** - Standardize to `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]` in files using `focus-visible:ring-*` or missing focus styles: `StoryWriterLauncherModal.tsx` (2 select triggers + session cards), `AppToolbar.tsx` close button.

5. **AC5 (skip-to-content)** - Add skip link in `src/app/(app)/layout.tsx` and `id="main-content"` on the `<main>` element.

6. **AC6 (keyboard testing)** - Browser verification of sprint board, ticket detail, and chat keyboard navigation.

## Acceptance Criteria

- [x] Replace all div/span onClick interactive elements with `<button>` or `Button` component
- [x] Add `aria-label` to all icon-only buttons
- [x] Ensure all modals trap focus (tab does not escape modal)
- [x] Consistent `focus-visible` ring across all interactive elements
- [x] Add skip-to-content link in app layout
- [ ] Test keyboard navigation through main flows (sprint board, ticket detail, chat)

## Impact

Fixes ~150 non-semantic interactive elements across the codebase. After this audit, all clickable elements will be keyboard-navigable, screen-reader-accessible, and have consistent focus indicators, bringing the application up to baseline WCAG 2.1 compliance.
