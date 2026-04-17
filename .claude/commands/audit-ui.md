Audit the entire frontend for UI/UX consistency. Inventory all components, then check every view for uniformity.

## What to look for

- **Component consistency**: same UI patterns (buttons, inputs, cards, modals, badges) built differently in different places
- **Design tokens**: hardcoded colors, spacing, typography, shadows that should use shared values
- **Typography**: one-off text sizes/weights that break the hierarchy
- **Interactive states**: clickable elements missing hover, focus-visible, or active states
- **Loading, empty, and error states**: missing or inconsistent across views
- **Accessibility**: missing labels, roles, keyboard navigation

## Workflow

1. Explore all components and pages via code
2. Use browser automation to visually verify findings across views
3. For each component type, identify the "canonical" version and flag deviations

## Output

- Create user stories for improvements. Group related items (e.g. one story for "standardize all button variants", not five separate ones).
- **Summary**: when done, present a concise overview of findings and stories created.

## Rules

- Do NOT change styling or behavior without discussion
- Prioritize by user-facing impact: frequently seen views > settings > edge cases
