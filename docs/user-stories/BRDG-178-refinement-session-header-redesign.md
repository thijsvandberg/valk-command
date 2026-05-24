# BRDG-178: Refinement Session Header Redesign

**Status:** Not Started
**Priority:** Medium

## Description

As a PO, I want the refinement session header to match the look and feel of the regular ViewHeader, so the UI feels consistent and I have all key actions readily available in one place without needing a separate bottom navigation bar.

Currently the refinement session has its own inline header that looks disconnected from the rest of the app (no logo, no brand glow, different styling). Navigation buttons (Previous / Done, next ticket) are in a separate bottom bar, wasting vertical space.

## Current State

- Custom inline header in `src/app/(app)/refinement/session/page.tsx` (lines 362-532)
- No Bridge logo or brand styling
- Bottom bar with Previous / Done, next ticket buttons (lines 606-642)
- Chat / Subtasks / Notes toggles have no count badges
- No visual consistency with `ViewHeader` component

## Acceptance Criteria

- [ ] **Brand identity**: Add Bridge logo (BridgeMark) and "Bridge" wordmark to the left side of the session header, matching ViewHeader style including gradient accent line and subtle glows
- [ ] **Remove notification bell**: The refinement session header should NOT include the NotificationBell (unlike ViewHeader), since the session is a focused flow
- [ ] **Count badges on pane toggles**: Add count badges (small pill) to Chat, Subtasks, and Notes toggle buttons showing the number of items:
  - Chat: number of messages in the ticket's chat thread
  - Subtasks: number of subtasks on the ticket
  - Notes: number of PO notes/annotations
  - Badge only shown when count > 0
  - Badge styling should match the existing count badges used elsewhere in the app (e.g., History tab badge)
- [ ] **Move navigation to header**: Relocate Previous and Done/next ticket (or End Session) buttons from the bottom bar into the header bar, removing the bottom bar entirely
  - Previous button on the left (after Exit Session, separated by divider)
  - Done/next ticket (or End Session on last ticket) on the right side of the header
  - This frees up vertical real estate for the ticket content
- [ ] **Maintain all existing functionality**: Exit Session, TicketStatusPill, StoryPointPicker, metadata toggle, overflow menu, progress dots, navigation dropdown, and pane toggles must all remain functional
- [ ] **Keyboard shortcuts still work**: All existing keyboard shortcuts (P for notes, etc.) remain unchanged

## Technical Notes

- Refactor to use or extend `ViewHeader` component, or adopt its styling patterns (gradient border, glows, brand section)
- Count data for badges: subtasks come from the ticket detail API, chat messages from the chat API, notes from the PO notes field
- Bottom bar removal: the `flex-col` layout currently has top bar, content, bottom bar. After this change it will be top bar + content only
- Components involved:
  - `src/app/(app)/refinement/session/page.tsx` (main session page)
  - `src/components/shared/ViewHeader.tsx` (reference for styling)
  - `src/components/shared/BridgeMark.tsx` (logo component)

## Design Reference

The header should follow the same visual language as ViewHeader:
- `bg-[var(--color-surface-chrome)]` background
- Top accent gradient line (`via-[rgba(14,142,136,0.35)]`)
- Left and right radial glows
- BridgeMark in branded green pill
- "Bridge" wordmark with display font

## Dependencies

None
