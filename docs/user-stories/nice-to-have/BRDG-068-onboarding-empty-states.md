# BRDG-068: Onboarding and Empty States

**Status:** Open
**Priority:** Low

## Description

As a new user, I want guided onboarding and meaningful empty states with action prompts so I know how to set up and use the app when it's fresh.

## Acceptance Criteria

### Phase 1: First-run detection
- [ ] Detect first run: check if any sprints exist in the database
- [ ] If no sprints: show onboarding wizard instead of normal Dashboard
- [ ] Track onboarding completion in `appSetting` table

### Phase 2: Onboarding wizard
- [ ] Step 1: Welcome screen with app overview
- [ ] Step 2: Configure Jira connection (enter credentials, test connection)
- [ ] Step 3: Configure Bitbucket connection (optional, skip if not needed)
- [ ] Step 4: First sync (trigger sprint + ticket sync with progress indicator)
- [ ] Step 5: Done screen with links to Sprint Board and key features
- [ ] Progress dots/stepper showing current step

### Phase 3: Empty states per page
- [ ] Sprint Board: "No tickets yet. Sync a sprint to get started." with sync button
- [ ] Chat: "No conversations yet. Start a new conversation." with create button
- [ ] Activity Log: "No activity yet. Activity will appear after your first sync."
- [ ] Refinement: "No sprint selected. Choose a sprint to prepare for refinement."
- [ ] Test Center: "No test data yet. Test results appear after linking pipelines."

### Phase 4: Feature hints
- [ ] First time visiting Story Writer: brief tooltip explaining what it does
- [ ] First time opening a ticket: highlight key areas (sidebar, editor, history)
- [ ] Dismiss hints permanently (stored in localStorage)
- [ ] "Reset hints" option in Settings

## Technical Notes

- Onboarding wizard is a separate component rendered conditionally in the Dashboard
- Empty states use the existing `EmptyState` component with customized content
- Feature hints: use a simple tooltip component positioned near the target element
- Hint dismissal stored in localStorage (not DB, as it's UI preference)

## Out of Scope (for now)
- Video tutorials
- Interactive product tour (walkthrough overlay)
- In-app documentation
- Sample/demo data generation
