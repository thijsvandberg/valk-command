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

This audit ends with a concrete, phased implementation proposal — not just a list of findings.

1. **Bundle findings into user stories**: group related items into focused stories (`docs/user-stories/BRDG-XXX-*.md`) — e.g. one story for "standardize all button variants", not five separate ones. For each, sketch the fix approach (canonical component, which tokens to use) so it's ready to hand off. Pick the next free BRDG number by scanning BOTH `docs/user-stories/` and `docs/user-stories/completed/`.
2. **Group into phases**: order the stories into numbered phases (Fase 1, Fase 2, …) by user-facing impact (frequently seen views > settings > edge cases) and dependency. Each phase must be independently shippable; avoid two phases editing the same component. Name them plainly ("Fase 1") so `/handoff fase 1` resolves them directly.
3. **Record the plan**: write the phased proposal to `docs/investigations/YYYY-MM-DD-audit-ui.md` — the phases, the stories per phase (ID + one-line goal + file path), and the ordering rationale. (Date from the environment; never invent it.)

## Report (in chat)

Report in Dutch, understandable for a technical PO, concise and to the point:
- The phased proposal: each phase and its stories, prioritized (impact vs effort).
- One line: run `/handoff fase 1` to hand the first phase to a fresh agent.
No long prose; do not paste story bodies into chat.

## Rules

- Do NOT change styling or behavior without discussion
- Prioritize by user-facing impact: frequently seen views > settings > edge cases
