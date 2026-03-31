Create GitHub issues from the conversation context or from the argument provided.

## Input

- If arguments are provided: use them as the feature description
- If no arguments: look at the recent conversation for what was discussed and create issues from that

## For each issue

1. Write a clear title with `feat:`, `fix:`, or `chore:` prefix
2. Write a description and acceptance criteria
3. Add `Depends on #N` if it depends on an open issue (check with `gh issue list --repo thijsvandberg/valk-command --state open`)
4. Determine the model:
   - `model:sonnet` for: bugfixes, docs, styling, config changes, simple features with 1-3 AC that follow existing patterns
   - `model:opus` for: new architecture, database changes, complex state management, 4+ AC, or anything that requires creating new patterns
5. Create with: `gh issue create --repo thijsvandberg/valk-command --title "..." --body "..." --label "model:sonnet"` (or `model:opus`)

## Rules

- Split large features into multiple issues with dependencies
- Keep issues small enough for one agent to handle
- Always check existing open issues to avoid duplicates and set correct dependencies
- Present the issues to the user before creating them. Create after confirmation.

$ARGUMENTS
