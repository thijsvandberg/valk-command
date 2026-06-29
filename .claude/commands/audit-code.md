Audit the entire codebase for refactoring opportunities. Explore every layer systematically using parallel agents.

## What to look for

- **Structure and reuse**: duplicated logic, code that should be shared utilities/hooks, inconsistent patterns
- **Performance**: unnecessary re-renders, missing memoization, inefficient queries, N+1 patterns
- **Security**: injection risks, missing input validation at system boundaries, unsafe data handling
- **Best practices**: anti-patterns, deprecated APIs, TypeScript strictness gaps
- **Stability**: race conditions, unhandled edge cases, fragile assumptions

## Output

This audit ends with a concrete, phased implementation proposal — not just a list of findings.

1. **Small, safe fixes**: apply directly, run `npm run lint` / `npm run typecheck` / `npx vitest run`, and commit.
2. **Larger items → user stories**: bundle related findings into focused stories (`docs/user-stories/BRDG-XXX-*.md`), combining where logical (prefer fewer well-scoped stories over many tiny ones). For each, sketch the implementation approach so it's ready to hand off. Pick the next free BRDG number by scanning BOTH `docs/user-stories/` and `docs/user-stories/completed/`.
3. **Group into phases**: order the stories into numbered phases (Fase 1, Fase 2, …) by priority (security > stability > performance > best practices > structure) and dependency. Each phase must be independently shippable; avoid two phases editing the same file. Name them plainly ("Fase 1") so `/handoff fase 1` resolves them directly.
4. **Record the plan**: write the phased proposal to `docs/investigations/YYYY-MM-DD-audit-code.md` — the phases, the stories per phase (ID + one-line goal + file path), and the ordering/coupling rationale. (Date from the environment; never invent it.)

## Report (in chat)

Report in Dutch, understandable for a technical PO, concise and to the point:
- What was already fixed (with commit hashes).
- The phased proposal: each phase and its stories, prioritized (impact vs effort).
- One line: run `/handoff fase 1` to hand the first phase to a fresh agent.
No long prose; do not paste story bodies into chat.

## Rules

- Do NOT change application behavior without discussion
- Do NOT refactor working code just because you would write it differently
- Prioritize by impact: security > stability > performance > best practices > structure
