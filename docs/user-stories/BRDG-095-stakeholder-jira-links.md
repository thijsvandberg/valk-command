# BRDG-095: Stakeholder View - Jira Links on Tickets

**Status:** Open
**Priority:** Medium

## Description

As the PO, I want stakeholders to be able to open a ticket directly in Jira from the stakeholder view so they can read the full ticket details without having to search for it themselves.

## Acceptance Criteria

- [ ] A subtle external link icon appears on each ticket card when the user hovers over it
- [ ] Clicking the icon opens the full Jira ticket URL in a new browser tab
- [ ] The Jira base URL is read from the existing Jira client configuration already available in the app; it is not hardcoded
- [ ] The icon is not visible when the card is not hovered, keeping the view uncluttered
- [ ] The `jiraKey` field is exposed through the stakeholder transformation layer and used to construct the ticket URL
- [ ] The `jiraKey` value is not displayed prominently in the UI; it is only used to build the link

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
