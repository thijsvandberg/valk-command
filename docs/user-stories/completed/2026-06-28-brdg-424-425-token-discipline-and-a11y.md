# Handoff prompt — BRDG-424 / 425 (token-discipline cleanup + accessibility baseline)

Generated 2026-06-28. Scope: the final two UI-audit stories, in order 424 → 425. (BRDG-418/423 are
done; 419/421 shipped; 420/422 shipped their core slice and are partially complete.) Paste the fenced
block below into a fresh agent thread.

```text
You are implementing stories BRDG-424 -> BRDG-425 (the last two UI-audit stories) end-to-end,
AUTONOMOUSLY, one after another in THAT order, on the `dev` branch of the Bridge (valk-command)
project. This prompt is your standing approval to implement both without pausing to ask "shall I
start?" per item. Commit your own work as you go, track progress, archive finished stories, and only
advance once the current item is genuinely green. Keep going until both are done or you hit a real
blocker.

Read first:
- `CLAUDE.md` (project + global rules).
- Each story's file IN FULL before you start it:
  - `docs/user-stories/BRDG-424-token-discipline-typography-shadows-surfaces.md`
  - `docs/user-stories/BRDG-425-accessibility-baseline-pass.md`
- `docs/architecture/optimistic-updates.md` — read BEFORE touching `BoardRow.tsx` or any editable
  board/ticket field (BRDG-425 adds keyboard support to board/child-issue rows).
- Context: these two close out a whole-frontend UI audit. Sibling stories already shipped and their
  work is LIVE in the tree — do not redo it (see cautions). The design-token source of truth is
  `src/app/globals.css`. Before you start each story, VERIFY the current state in code (grep) rather
  than assuming, because earlier slices already changed some of these files.

Scope & order (do them in this exact order):

1. BRDG-424 — Token discipline cleanup (typography, shadows, surfaces).
   Goal: stop bypassing the existing token system with arbitrary values. Codemod `text-[10px]`->
   `text-caption` / `text-[11px]`->`text-label` (and other exact-duplicate px sizes); decide+apply a
   `font-display` rule for section headings; declare `--font-space-mono` in `@theme`; tokenize the
   one-off `tracking-`/`leading-` values; pick ONE invocation form for shadows/surfaces
   (`shadow-sm`/`bg-surface-elevated` bare utilities recommended) and codemod toward it; replace the ~22
   arbitrary `shadow-[0_...]` with the nearest token (modals->`shadow-modal`, dropdowns->`shadow-popover`,
   cards->`shadow-sm`); add hover-shade tokens so `#d04840`/`#1ea34d`/`#b48ee6` become `var(...)`;
   replace `#9b6cd4` with `--color-icon-epic`. Do it as several small codemod commits.
   File: `docs/user-stories/BRDG-424-token-discipline-typography-shadows-surfaces.md`.
   Why first: almost entirely mechanical, pixel-identical swaps — lowest risk; leaves the shared files
   token-clean before 425 adds semantic structure.

2. BRDG-425 — Accessibility baseline pass (keyboard + widget roles + landmarks).
   Goal: keyboard-enable the clickable non-button rows/divs (`BoardRow.tsx` `<tr onClick>`,
   `ChildIssueRow.tsx`, the 5 `pipelines/FilterBar.tsx` divs, etc. — copy the correct pattern at
   `nav/NavPanel.tsx:139`); add widget roles to the shared primitives (`shared/TabBar.tsx` ->
   tab/tablist/tabpanel/aria-selected; the shared `MenuItem` -> menu/menuitem + trigger aria-haspopup/
   aria-expanded; `CommandPalette`/`SearchModal` -> combobox/listbox/option + aria-activedescendant);
   make the `ViewHeader` title a real `<h1>`; wrap the persistent nav chrome in a `<nav aria-label>`;
   give the listed unlabeled selects/inputs an accessible name.
   File: `docs/user-stories/BRDG-425-accessibility-baseline-pass.md`.
   Why second: additive but behavioural (keyboard handlers/roles) and needs more judgment; builds on
   primitives shipped by sibling stories.

Couplings & cautions (baked in for this thread — read carefully):
- SEQUENTIAL, NEVER PARALLEL. 424 and 425 BOTH edit `shared/ViewHeader.tsx` (424: wordmark size +
  display font; 425: title `<span>` -> `<h1>`) and `command-palette/CommandPalette.tsx` (424: `#9b6cd4`
  hex; 425: combobox roles). Do 424 fully, re-run the FULL suite, then 425.
- ALREADY SHIPPED by earlier slices — VERIFY then build on, do NOT redo or revert:
  - BRDG-420 already added a keyboard focus-visible ring to every `focus:outline-none` field (incl. the
    inline editors `EditableTitle`/`EditableConversationTitle`/`ChildIssueRow` etc.) and added
    `focus-ring-guard.test.ts`. BRDG-425's "focus indicator on inline editors" item is therefore largely
    DONE — confirm the ring is present and SKIP that sub-item; just keep the guard test green.
  - BRDG-421 created the shared `MenuItem` primitive. Add menu roles THERE (one place), not by
    rebuilding individual menus.
  - BRDG-422 already gave `CommandPalette`/`SearchModal`/`SprintStatsPopover`/`StoryWriterLauncherModal`
    `role="dialog"` + `aria-modal` and locked it with `overlay-zindex-guard.test.ts`. BRDG-425 ADDS the
    combobox/listbox/option layer on top — do not remove the dialog semantics or break that guard test.
- STAY IN SCOPE in 424: it is NON-STATUS tokens only. Do NOT touch status colors (that was BRDG-419,
  already shipped) and do NOT re-fix the undefined `--color-surface-default` tokens (that was BRDG-418,
  already done). Do not drift into adding ARIA — that's 425.
- DO NOT refactor `SprintBoard.tsx` structurally (owned by BRDG-415/416). BRDG-425 touches
  `BoardRow.tsx` for row keyboard support — keep it surgical, and FIRST check the board files for
  uncommitted parallel work; if the tree carries unrelated board changes, STOP and ask rather than
  staging them.
- VISIBLE CHANGE worth flagging: 424's "display font on section headings" changes ~51 headings from
  Inter to Bricolage. That is a real visual change (not a pixel-identical swap). Decide a sensible
  cutoff (the story suggests e.g. all h1-h3 vs only h1-h2), apply it, invoke the `frontend-design` skill
  first, and FLAG it in the final report. The px->token and shadow->token swaps should be visually
  identical; verify a few in Chrome.

The loop for each item:
1. Read the item. If it has an "Open Questions" / recommended-default flavour (424: heading-font cutoff,
   whether to add a 9px token; 425: board-row keyboard scheme vs documenting the existing global
   shortcut), follow the recommendation — do not stop to ask unless the default proves wrong/blocking
   once you're in the code.
2. Implement it. You may use the `/implement-story` command as the per-story harness. These are a
   mechanical token-discipline cleanup (424) and additive accessibility hardening (425): PRESERVE
   existing behaviour for mouse users; the tests are your guardrail; do not change behaviour beyond
   scope.
3. If anything visual changes, invoke the `frontend-design` skill first (global rule).
4. Write/extend co-located `*.test.ts(x)` tests for every change — including the guard tests the stories
   list (424: no `text-[Npx]` outside an allowlist, no raw `shadow-[0_...]`, no `#`-hex in className/
   inline style outside the decorative allowlist; 425: role assertions for TabBar/MenuItem/the palette
   listbox, keyboard-activation tests for the rows).
5. Verify it ACTUALLY works (the bar to advance — see "Definition of done").
6. Commit (conventional commit referencing the item ID; English; no emojis; NO "Co-Authored-By"). Stage
   EXPLICIT paths only — never `git add -A`/`.` (the tree may carry unrelated work). Several commits per
   item is fine (424 especially: one commit per codemod slice).
7. Tick the item's checkboxes as you satisfy them; when all are met, add a short "## Status" run note at
   the top and archive the story: move it to `docs/user-stories/completed/` and commit
   `chore: archive BRDG-XXX as completed`.
8. Only then move to the next item.

Definition of done (must ALL hold before advancing):
- `npm run lint`, `npm run typecheck`, `npx vitest run` (FULL suite), and `npm run build` all green.
- The item's acceptance criteria are met.
- It is E2E-verified in the REAL running app — not just unit tests:
  - 424: spot-check a few migrated surfaces in Chrome in BOTH light and dark theme — the px->token and
    shadow->token swaps look identical; the heading-font change looks intentional; no console errors.
  - 425: Tab through the sprint board / a ticket-detail view / pipelines filters and confirm rows and
    controls are reachable and Enter/Space activates them; confirm one `<h1>` per page and a `<nav>`
    landmark; no new console errors. Navigate from the sprint board (click into views/tickets), not by
    direct URL (direct URLs hit the Clerk redirect). Use the `verify` or `validate-ui` skill.

Hard rules (non-negotiable):
- TESTS: `npx vitest run` in the FOREGROUND, ONE process at a time, no pipes, no background, no
  sleep+cat polling. 16GB machine — concurrent vitest thrashes swap. A postToolUse hook may auto-run
  tests after edits; let it finish, don't overlap it.
- Run lint + typecheck + test + build before EVERY commit.
- DEV SERVER on port 3100 for Chrome checks: `curl -s localhost:3100` to see if it's up before starting;
  never start a second instance; never background it with `&`. After any `npm run build`, RESTART it
  (`lsof -ti:3100 | xargs kill -9 2>/dev/null` then `npm run dev`).
- BRANCHES: do NOT create/switch branches (a PreToolUse hook blocks it). Commit directly to `dev`. No PR
  unless asked.
- Conventional commits, English only, no emojis, no "Co-Authored-By". Update `/docs` when
  behaviour/architecture changes.

Chrome / auth: the app is Clerk-gated. First check existing browser tabs and reuse an already-
authenticated Bridge tab if one is open; otherwise use the development auth bypass (check
`src/middleware.ts` and `src/app/api/dev/` / `src/app/dev/` — a dev-only httpOnly cookie; GET
`/api/dev/bypass` sets it). If neither works, that's a valid reason to ask the PO to log in once in the
tab you're driving. Never trigger native alert/confirm dialogs (they freeze the automation).

Ask the PO sparingly: decide for yourself using the item's recommended defaults and the tests. Only ask
when something is genuinely unverifiable by tests or Chrome (a subjective product/visual call such as
the heading-font cutoff if you're truly unsure, a wrong default that changes scope, or you can't
authenticate Chrome). BATCH questions into one message; keep working on anything unblocked; never ask
permission to start/continue.

Pause, don't thrash: if after a couple of honest attempts an item won't go green, or a shared-file
change (`ViewHeader.tsx`, `CommandPalette.tsx`, `globals.css`, `BoardRow.tsx`) regresses unrelated tests
and the fix is non-obvious, STOP that item, leave the tree committed-or-clean (never a half-applied
broken edit), note where you're stuck, and continue with the next INDEPENDENT item (424 and 425 are
independent enough that a blocked 424 sub-slice need not block 425). Report blocked items at the end.
Never loop indefinitely on the same failure.

When every item is done: archive this handoff prompt itself —
`git mv docs/prompts/2026-06-28-brdg-424-425-token-discipline-and-a11y.md docs/user-stories/completed/`
and commit `chore: archive handoff prompt brdg-424-425-token-discipline-and-a11y`. This keeps
`docs/prompts/` to active handoffs only. Skip this if either item is still blocked (leave the prompt in
place so the next run can pick it up).

At the end, report a summary in Dutch, understandable for a technical PO, concise and to the point:
which items shipped (with commit hashes), which are blocked and why, anything deferred or worth the PO's
attention (especially the heading-font visual change in 424 and any board-row keyboard-scheme decision
in 425). No long prose.
```
