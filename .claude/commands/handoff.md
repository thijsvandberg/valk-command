Turn the work proposed in this thread into a copy-pasteable prompt that a fresh agent runs autonomously. You pick the scope (all / specific stories / a phase); this command resolves it, writes the prompt to `docs/prompts/`, and reports back in Dutch.

## Input

`$ARGUMENTS` is the scope selector. Examples:
- `all` — every story / item proposed in this thread.
- `BRDG-405, BRDG-406` — only those stories.
- `fase 1` / `phase 1` / `security` — a named phase or group discussed in this thread.

If `$ARGUMENTS` is empty: list the work items you detect in this thread and ask the PO (one concise question, in Dutch) which to include. Do not guess.

## What this command does

1. **Find the proposed work in this thread.** Identify the concrete items this conversation produced or discussed: user stories (`docs/user-stories/BRDG-XXX-*.md`), phases of a plan, or a task list. Prefer items that exist as files on disk.
2. **Resolve the scope** from `$ARGUMENTS` to a concrete, ordered list of items with their file paths. If a selector is ambiguous (e.g. "phase 1" was never defined), ask the PO to clarify rather than inventing scope.
3. **Order them** lowest-risk / fewest-dependencies first, and note any coupling (e.g. two stories editing the same file → must be sequential, never parallel) and any thread-specific cautions (e.g. "do not touch the X fix").
4. **Generate the prompt** by filling the template below with the resolved scope, the item list + paths, the order, and the cautions. Save it to `docs/prompts/YYYY-MM-DD-<slug>.md` with the prompt inside a single fenced ```text block so it copy-pastes cleanly. (Get the date from the environment; never invent it.)
5. **Report back** (see "After saving").

## The prompt template (fill the {{placeholders}}; keep everything else)

Write this into the file, wrapped in a ```text fence:

> You are implementing {{scope summary, e.g. "stories BRDG-405 → BRDG-410" or "phase 1: BRDG-409, BRDG-410"}} end-to-end, AUTONOMOUSLY, one after another, on the `dev` branch of the Bridge (valk-command) project. This prompt is your standing approval to implement all of them without pausing to ask "shall I start?" per item. Commit your own work as you go, track progress, archive finished stories, and only advance once the current item is genuinely green. Keep going until all are done or you hit a real blocker.
>
> **Read first:** `CLAUDE.md` (project + global rules); {{the relevant thread artifacts — e.g. the investigation doc that motivates these items}}; `docs/architecture/optimistic-updates.md` if any item touches board edits; and each item's file in full before you start it.
>
> **Scope & order (do them in this order):**
> {{numbered list: each item ID + one-line goal + file path; call out couplings, e.g. "X and Y both edit SprintBoard.tsx — sequential, X before Y, re-run the full suite between them" and any "do NOT touch Z" cautions}}
>
> **The loop for each item:**
> 1. Read the item. If it has an "Open Questions" section with a recommended default, follow the recommendation — do not stop to ask unless the default proves wrong/blocking once you're in the code.
> 2. Implement it. You may use the `/implement-story` command as the per-story harness. These are {{refactors/hardening/features}}: preserve existing behaviour unless the item says otherwise; the tests are your guardrail; do not change behaviour beyond scope.
> 3. If anything visual changes, invoke the `frontend-design` skill first (global rule).
> 4. Write/extend co-located `*.test.ts(x)` tests for every change.
> 5. Verify it ACTUALLY works (the bar to advance — see "Definition of done").
> 6. Commit (conventional commit referencing the item ID; English; no emojis; NO "Co-Authored-By"). Stage EXPLICIT paths only — never `git add -A`/`.` (the tree may carry unrelated work). Several commits per item is fine.
> 7. Tick the item's checkboxes as you satisfy them; when all are met, add a short "## Status" run note at the top and archive the story: move it to `docs/user-stories/completed/` and commit `chore: archive {{ID}} as completed`.
> 8. Only then move to the next item.
>
> **Definition of done (must ALL hold before advancing):**
> - `npm run lint`, `npm run typecheck`, `npx vitest run` (FULL suite), and `npm run build` all green.
> - The item's acceptance criteria are met.
> - It is E2E-verified in the REAL running app — not just unit tests:
>   - UI items: drive the affected view in Chrome via the available browser tools, confirm the behaviour and that the console shows no new errors. Navigate from the sprint board (click into a ticket), not by direct URL (direct URLs hit the Clerk redirect). Use the `verify` or `validate-ui` skill.
>   - Backend items: trigger the real route/sync against the running dev server and confirm correct behaviour + no server errors.
>
> **Hard rules (non-negotiable):**
> - TESTS: `npx vitest run` in the FOREGROUND, ONE process at a time, no pipes, no background, no sleep+cat polling. 16GB machine — concurrent vitest thrashes swap. A postToolUse hook may auto-run tests after edits; let it finish, don't overlap it.
> - Run lint + typecheck + test + build before EVERY commit.
> - DEV SERVER on port 3100 for Chrome checks: `curl -s localhost:3100` to see if it's up before starting; never start a second instance; never background it with `&`. After any `npm run build`, RESTART it (`lsof -ti:3100 | xargs kill -9 2>/dev/null` then `npm run dev`).
> - BRANCHES: do NOT create/switch branches (a PreToolUse hook blocks it). Commit directly to `dev`. No PR unless asked.
> - Conventional commits, English only, no emojis, no "Co-Authored-By". Update `/docs` when behaviour/architecture changes.
>
> **Chrome / auth:** the app is Clerk-gated. First check existing browser tabs and reuse an already-authenticated Bridge tab if one is open; otherwise use the development auth bypass (check `src/middleware.ts` and `src/app/api/dev/` / `src/app/dev/` — a dev-only httpOnly cookie). If neither works, that's a valid reason to ask the PO to log in once in the tab you're driving. Never trigger native alert/confirm dialogs (they freeze the automation).
>
> **Ask the PO sparingly:** decide for yourself using the item's recommended defaults and the tests. Only ask when something is genuinely unverifiable by tests or Chrome (a subjective product/visual call, a wrong default that changes scope, or you can't authenticate Chrome). BATCH questions into one message; keep working on anything unblocked; never ask permission to start/continue.
>
> **Pause, don't thrash:** if after a couple of honest attempts an item won't go green, or a shared-file change regresses unrelated tests and the fix is non-obvious, STOP that item, leave the tree committed-or-clean (never a half-applied broken edit), note where you're stuck, and continue with the next INDEPENDENT item. Report blocked items at the end. Never loop indefinitely on the same failure.
>
> **At the end, report a summary in Dutch, understandable for a technical PO, concise and to the point:** which items shipped (with commit hashes), which are blocked and why, anything deferred or worth the PO's attention. No long prose.

## After saving

Report to the PO in Dutch (concise, for a technical PO):
- The path of the saved prompt file.
- Which items it covers, in which order, and any coupling/caution you baked in.
- One line: paste it into a fresh thread to run.
Keep it short. Do not paste the whole prompt back into chat.

## Rules

- Do NOT start implementing the work yourself — this command only PRODUCES the handoff prompt.
- Do NOT invent scope: if the selector doesn't map to concrete items, ask.
- Keep the generated prompt self-contained (it must make sense with zero prior thread context).
- All file content in English; the chat report back to the PO in Dutch.
