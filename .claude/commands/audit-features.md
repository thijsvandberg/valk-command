Audit the application from a product perspective. Analyze what exists, what is incomplete, and what is missing. Propose improvements as user stories.

## What to look for

- **Incomplete features**: things that feel half-built or have rough edges
- **Missing features**: obvious gaps based on the PRD, architecture docs, and product purpose
- **Integration opportunities**: existing integrations that could be deepened, new ones that would add value
- **Workflow friction**: common flows that take too many steps or lack automation
- **Unsurfaced data**: data available in the system but not visible in the UI
- **Previously rejected ideas**: review stories marked won't-do or deprioritized. Are any worth reconsidering?

## Workflow

1. Read all product docs (PRD, architecture, existing stories including completed/won't-do, backlog)
2. Use browser automation to go through every view and interaction
3. Explore the codebase for unused endpoints, partial integrations, unsurfaced data

## Output

- Create user stories. Combine related small items. Keep new feature stories focused on one capability.
- **Summary**: when done, present a prioritized overview of stories created (impact vs effort).

## Rules

- Do NOT implement anything, only propose
- Do NOT change existing code
- Be specific: describe what the feature does, not just a vague idea
- Reference existing code/data that enables the proposal
