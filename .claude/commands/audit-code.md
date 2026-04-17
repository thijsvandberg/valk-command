Audit the entire codebase for refactoring opportunities. Explore every layer systematically using parallel agents.

## What to look for

- **Structure and reuse**: duplicated logic, code that should be shared utilities/hooks, inconsistent patterns
- **Performance**: unnecessary re-renders, missing memoization, inefficient queries, N+1 patterns
- **Security**: injection risks, missing input validation at system boundaries, unsafe data handling
- **Best practices**: anti-patterns, deprecated APIs, TypeScript strictness gaps
- **Stability**: race conditions, unhandled edge cases, fragile assumptions

## Output

- **Small issues**: fix directly, run lint/typecheck/tests, commit
- **Larger items**: group related findings into user stories. Combine where possible, prefer fewer well-scoped stories over many tiny ones.
- **Summary**: when done, present a concise overview of what was fixed and what stories were created.

## Rules

- Do NOT change application behavior without discussion
- Do NOT refactor working code just because you would write it differently
- Prioritize by impact: security > stability > performance > best practices > structure
