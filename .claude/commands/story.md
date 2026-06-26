Author a new user story end-to-end: ground it in the codebase, draft it in the standard `BRDG-XXX` format, resolve or park open questions, and commit it once the PO approves. Produces only the story doc, never code.

## Input

`$ARGUMENTS` is the story idea in the PO's own words (free text, any language). Examples:
- `melding bij nieuwe inbox tickets, max 2x per werkdag`
- `epic roadmap should show a quarter divider`

If `$ARGUMENTS` is empty: ask the PO in one short Dutch sentence what the story should cover. Do not guess.

## What this command does

1. **Ground it in the codebase (no code changes).** Before writing anything, investigate how the affected area actually works so the story is real, not aspirational: read the relevant components/routes/lib, find existing patterns to reuse, and note the concrete files/tables/hooks involved. For anything that spans several files or naming conventions, fan out with `Explore`/`Agent` subagents and keep only the conclusions. Read `CLAUDE.md` and any relevant `docs/architecture/*` doc.
2. **Pick the next BRDG number.** Scan for the highest `BRDG-XXX` across ALL story folders: `docs/user-stories/`, `docs/user-stories/completed/`, `docs/user-stories/nice-to-have/`, `docs/user-stories/wont-do/`. Use highest + 1. (Scanning every folder avoids reusing a retired number.)
3. **Surface open questions (concise, Dutch).** List only the ambiguities that genuinely change the design or are the PO's call (UX, scope, product behaviour) — not things you can verify in the code or decide with a sensible default. For each, give a one-line recommended default. Then let the PO either **answer now** or **keep it open in the story**. Use the `AskUserQuestion` tool when the choice is a clean pick between concrete options. Do not bikeshed decisions a default already settles — mention the default and move on.
4. **Draft the story** in the standard format (see skeleton below), grounded in step 1. Each acceptance criterion gets an inline `<!-- implementation hint -->` pointing at the file/function that satisfies it, like existing stories. Questions the PO chose to keep open go in an `## Open Questions` section, each with the recommended default and enough context for a future implementer to act without this thread. Write it to `docs/user-stories/BRDG-XXX-<kebab-slug>.md`.
5. **Present it kort en bondig** (Dutch, technical-PO language): the path, a 2-4 line summary of the approach, any design call you made on the PO's behalf, and a one-line list of what's parked under Open Questions. Do not paste the whole story back into chat.
6. **Iterate** on the PO's feedback until they say it's good.
7. **Commit on approval only.** When the PO confirms the story is good, commit it: stage the explicit file path (`git add docs/user-stories/BRDG-XXX-<slug>.md` — never `git add -A`/`.`), message `docs: add BRDG-XXX <short title>`. Conventional commit, English, no emojis, no "Co-Authored-By". Do not commit before the PO approves.

## Story format (skeleton — match recent stories, e.g. `docs/user-stories/completed/BRDG-372-*.md`)

```
# BRDG-XXX: <concise title>

**Status:** To Do
**Priority:** Low | Medium | High
**Type:** Feature | Bugfix | Refactor | Chore

## Description
<what the PO wants and why, in plain terms. The decided behaviour, including any choices confirmed with the PO.>

## Current Behaviour
<how the affected area works today, with concrete file paths / tables / hooks from step 1. This is what keeps the story honest.>

## Proposed Approach
<the design, reusing named existing patterns. Call out non-goals / out-of-scope explicitly.>

## Open Questions   <!-- only if the PO parked anything -->
<one bullet per parked question: the question, the recommended default, and the context an implementer needs.>

## Implementation Plan   <!-- optional; add when the path is clear enough to phase -->
<numbered phases, files touched per phase.>

## Acceptance Criteria
- [ ] <criterion> <!-- where it's satisfied -->

## Tests
- [ ] <test that proves a criterion> <!-- test file -->

## Related
- [[BRDG-XXX-other-story]] — why it's related.
- Helpers / docs this builds on.
```

## Response style

- All chat with the PO: **Dutch, kort en bondig, begrijpelijk voor een technische PO** — trade-offs in terms of impact, not implementation detail. No long prose, no walls of text.
- The story file itself: **English** (project rule — all docs/code/UI strings are English, no exceptions). Never write the story content in Dutch.

## Rules

- This command PRODUCES a story doc only. Do NOT write or change any code, and do NOT start implementing.
- Do NOT commit until the PO says the story is good. Then stage explicit paths only.
- Ground every "Current Behaviour" claim in the actual code; if you can't verify it, say so rather than inventing it.
- Don't ask the PO things the codebase answers or a sensible default settles. Reserve questions for real product/UX/scope calls — and always offer "keep it open in the story" as an alternative to answering now.
- Conventional commit, English, no emojis, no "Co-Authored-By".
- If the work clearly splits into multiple stories, say so and confirm scope before drafting more than one.
