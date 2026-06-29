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

This audit ends with a concrete, phased implementation proposal — not just a list of ideas.

1. **Bundle findings into user stories**: combine related small items; keep each new-feature story focused on one capability (`docs/user-stories/BRDG-XXX-*.md`). Be specific — what the feature does and which existing code/data enables it — so it's ready to hand off. Pick the next free BRDG number by scanning BOTH `docs/user-stories/` and `docs/user-stories/completed/`.
2. **Group into phases**: order the stories into numbered phases (Fase 1, Fase 2, …) by impact vs effort and dependency (quick wins and unblockers first). Each phase should be independently shippable. Name them plainly ("Fase 1") so `/handoff fase 1` resolves them directly.
3. **Record the plan**: write the phased proposal to `docs/investigations/YYYY-MM-DD-audit-features.md` — the phases, the stories per phase (ID + one-line goal + file path), and the ordering rationale. (Date from the environment; never invent it.)

## Report (in chat)

Report in Dutch, understandable for a technical PO, concise and to the point:
- The phased proposal: each phase and its stories, prioritized (impact vs effort).
- One line: run `/handoff fase 1` to hand the first phase to a fresh agent.
No long prose; do not paste story bodies into chat.

## Rules

- Do NOT implement anything, only propose
- Do NOT change existing code
- Be specific: describe what the feature does, not just a vague idea
- Reference existing code/data that enables the proposal
