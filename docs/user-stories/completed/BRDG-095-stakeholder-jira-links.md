# BRDG-095: Stakeholder View - Jira Links on Tickets

**Status:** Done
**Priority:** Medium

## Description

As the PO, I want stakeholders to be able to open a ticket directly in Jira from the stakeholder view so they can read the full ticket details without having to search for it themselves.

## Implementation Plan

1. Update `toStakeholderTickets()` to set `jiraKey: t.key` instead of `null`
2. Create `src/lib/jira-url.ts` with a `getJiraUrl(key: string): string` helper using `NEXT_PUBLIC_JIRA_BASE_URL`
3. Update `TicketGroup` to render a hover-only external link `<a>` per ticket using CSS `group-hover:opacity-100` (icon only, no key text)
4. Update test asserting jiraKey is null to assert it passes through

## Acceptance Criteria

- [x] A subtle external link icon appears on each ticket card when the user hovers over it
- [x] Clicking the icon opens the full Jira ticket URL in a new browser tab
- [x] The Jira base URL is read from the existing Jira client configuration already available in the app; it is not hardcoded
- [x] The icon is not visible when the card is not hovered, keeping the view uncluttered
- [x] The `jiraKey` field is exposed through the stakeholder transformation layer and used to construct the ticket URL
- [x] The `jiraKey` value is not displayed prominently in the UI; it is only used to build the link

## Technical Notes

- The `jiraKey` field exists in the ticket data model but is currently set to null in the stakeholder transformation layer; update `toStakeholderSprint` (or equivalent transform) to pass `jiraKey` through
- Jira ticket URL pattern: `{JIRA_BASE_URL}/browse/{jiraKey}`
- Read `JIRA_BASE_URL` (or equivalent config key) from the Jira client config that is already used elsewhere in the app; do not introduce a new env var if one already exists
- The hover state should use CSS only (no JS event handlers for show/hide); use `group`/`group-hover` Tailwind utilities or equivalent
- Ensure the link element has `rel="noopener noreferrer"` when opening in a new tab

## Out of Scope

- Showing the Jira key as visible text on the card
- Inline ticket preview or popover
- Jira links in the copy-as-markdown output
- Jira links on the main sprint board (separate story if needed)
