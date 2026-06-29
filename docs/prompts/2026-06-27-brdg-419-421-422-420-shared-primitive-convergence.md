# Handoff prompt — BRDG-419 / 421 / 422 / 420 (shared-primitive convergence)

Generated 2026-06-27. Scope: the four "shared-primitive convergence" stories from the UI audit, in the
order 419 → 421 → 422 → 420. (BRDG-418 is already done; BRDG-423 was handed off separately; 424/425 are
out of scope here.) Paste the fenced block below into a fresh agent thread.

```text
You are implementing stories BRDG-419 -> BRDG-421 -> BRDG-422 -> BRDG-420 (the UI-audit "shared-
primitive convergence" set) end-to-end, AUTONOMOUSLY, one after another in THAT order, on the `dev`
branch of the Bridge (valk-command) project. This prompt is your standing approval to implement all
of them without pausing to ask "shall I start?" per item. Commit your own work as you go, track
progress, archive finished stories, and only advance once the current item is genuinely green. Keep
going until all are done or you hit a real blocker.

Read first:
- `CLAUDE.md` (project + global rules).
- Each story's file IN FULL before you start it (they contain the evidence, the canonical-pattern
  target, the proposed approach + trade-offs, and acceptance criteria):
  - `docs/user-stories/BRDG-419-status-color-single-source-of-truth.md`
  - `docs/user-stories/BRDG-421-converge-buttons-and-menu-items.md`
  - `docs/user-stories/BRDG-422-unify-overlays-and-zindex-scale.md`
  - `docs/user-stories/BRDG-420-consolidate-form-controls.md`
- `docs/architecture/optimistic-updates.md` — read BEFORE any change that touches an editable board
  field or ticket-detail composer (BRDG-420 and parts of 421 brush these).
- These four come from a whole-frontend UI audit; the design-token source of truth is
  `src/app/globals.css` and the reference well-built primitive usage is `chat/ConversationList.tsx`
  (states) and `chat/ConversationOverflowMenu.tsx` (a correctly-built menu).

Scope & order (do them in this exact order — it is dependency-correct, not arbitrary):

1. BRDG-419 — Status color single source of truth.
   Goal: fix the shared primitives `shared/InlineAlert.tsx`, `shared/Badge.tsx`, `shared/Tag.tsx` to
   derive color from `--color-status-*` (they currently hardcode raw red/amber/emerald); centralize the
   duplicated status->color maps (`STATUS_PILL_COLORS` vs `JIRA_STATUS_COLORS`) and the quality-score
   ramp (copied in 3 files); migrate hand-rolled status surfaces (pipelines, FinishSprintModal,
   story-writer, stakeholder insights) onto tokens; resolve green-vs-emerald for "success".
   File: `docs/user-stories/BRDG-419-status-color-single-source-of-truth.md`.
   Why first: it is foundational (other UI adopts these primitives) and largely mechanical token swaps.

2. BRDG-421 — Converge buttons and dropdown-menu items on the shared Button.
   Goal: build ONE shared `MenuItem`/`MenuList` primitive and migrate all overflow/context/popover
   menus onto it; adopt `ui/Button.tsx` for standalone buttons; normalize a single `active:scale-[0.97]`;
   ensure every button/menu item has a focus-visible state.
   File: `docs/user-stories/BRDG-421-converge-buttons-and-menu-items.md`.
   Why second: it CREATES the shared `MenuItem` that BRDG-422 then places inside unified popovers.

3. BRDG-422 — Unify overlays on shared Modal/Popover and apply the z-index scale.
   Goal: make the z-index tokens (`z-dropdown/z-modal/z-tooltip/z-notification`) authoritative (kill
   hardcoded `z-50`/`z-[9999]`/`z-[200]` and the layering inversions); migrate hand-rolled dialogs
   (StoryWriterLauncherModal, SearchModal, CommandPalette, SprintStatsPopover, SplitStoryPicker) onto
   `shared/Modal.tsx` for Escape/focus-trap/role/aria-modal; pick one anchored-panel primitive; apply
   `--shadow-modal`/`--shadow-popover` and one backdrop/radius scale.
   File: `docs/user-stories/BRDG-422-unify-overlays-and-zindex-scale.md`.
   Why third: highest-risk (focus-trap + z-index + modal migration); builds on the `MenuItem` from 421.

4. BRDG-420 — Consolidate form controls (inputs, one toggle, universal focus rings).
   Goal: adopt `shared/TextInput`/`TextArea` + a new shared `Select`; standardize one switch
   (`shared/ToggleSwitch.tsx`, replacing the oversized notifications switch + `bg-white` knobs);
   collapse the 4 input recipes to 1; guarantee a visible focus indicator on every field (incl. the ~29
   `focus:outline-none` inputs); one placeholder syntax; a shared disabled/error field state.
   File: `docs/user-stories/BRDG-420-consolidate-form-controls.md`.
   Why last: broadest surface and it OVERLAPS 422 on `CommandPalette.tsx` and `FilterDropdown.tsx` — do
   it after those overlay containers are settled so you don't edit them twice in conflicting ways.

Couplings & cautions (baked in for this thread — read carefully):
- SEQUENTIAL, NEVER PARALLEL. These items share files; run them strictly one at a time and re-run the
  FULL test suite between items. Shared-file overlaps to expect:
  - 421 and 422 both edit `ticket-action-menu.tsx`, `SprintDetailsPopover.tsx`, and the overflow menus
    (`StakeholderOverflowMenu.tsx`, `ConversationOverflowMenu.tsx`, `RefinementSessionMenu.tsx`) — 421
    introduces `MenuItem` there, 422 reshapes their overlay container. 421 strictly before 422.
  - 420 and 422 both touch `CommandPalette.tsx` and `FilterDropdown.tsx` — 422 first (container/z-index),
    420 after (input focus rings).
  - 419 and 421 may both touch `StoryWriterLayout.tsx` (419 colors, 421 buttons) and pipelines files.
- DO NOT refactor `SprintBoard.tsx`. The board's structure is owned by BRDG-415/416. If button/overlay/
  color adoption seems to require editing `SprintBoard.tsx`, keep the change minimal and surgical, and
  FIRST check that file for uncommitted parallel work — if the tree carries unrelated board changes,
  STOP and ask rather than staging them.
- BRDG-423 (data-state coverage) was handed off separately and may already be running or merged. It
  ADOPTS `InlineAlert` for error banners; BRDG-419 here RETUNES `InlineAlert`'s colors. Change only the
  color mapping inside `InlineAlert`, NOT its props/API, so the two don't conflict. If 423 is editing
  `InlineAlert.tsx` concurrently (uncommitted changes present), do 419's other surfaces first and come
  back to `InlineAlert` once that file is clean.
- STAY IN SCOPE per story. In 419, do NOT drift into the non-status token cleanup (typography, generic
  shadows, `#9b6cd4`-style hexes) — that is BRDG-424. In 420/421, do NOT add ARIA roles to tabs/menus/
  combobox beyond a focus-visible state — widget roles are BRDG-425.
- VISIBLE CHANGES need PO awareness: the notifications switch SHRINKS to the canonical size (420), button
  press-scale changes feel, and status colors shift (419, incl. green->emerald). Invoke the
  `frontend-design` skill before writing any of this UI. These were pre-approved in the audit; proceed,
  but flag them in the final report.

The loop for each item:
1. Read the item in full. Follow its proposed-approach recommendations / defaults (e.g. 420: inline
   focus ring choice; 422: a top-anchored "command" variant of Modal for the palette) — do not stop to
   ask unless a default proves wrong/blocking once you're in the code.
2. Implement it. You may use the `/implement-story` command as the per-story harness. These are
   consistency refactors / shared-primitive adoption: PRESERVE existing behaviour unless the item says
   otherwise; the tests are your guardrail; do not change behaviour beyond scope.
3. If anything visual changes, invoke the `frontend-design` skill first (global rule).
4. Write/extend co-located `*.test.ts(x)` tests for every change (incl. the guard tests each story
   lists, e.g. "no `<button>` without a focus-visible style", "no raw `z-[number]` on overlays").
5. Verify it ACTUALLY works (the bar to advance — see "Definition of done").
6. Commit (conventional commit referencing the item ID; English; no emojis; NO "Co-Authored-By"). Stage
   EXPLICIT paths only — never `git add -A`/`.` (the tree may carry unrelated work). Several commits per
   item is fine.
7. Tick the item's checkboxes as you satisfy them; when all are met, add a short "## Status" run note at
   the top and archive the story: move it to `docs/user-stories/completed/` and commit
   `chore: archive BRDG-XXX as completed`.
8. Only then move to the next item.

Definition of done (must ALL hold before advancing):
- `npm run lint`, `npm run typecheck`, `npx vitest run` (FULL suite), and `npm run build` all green.
- The item's acceptance criteria are met.
- It is E2E-verified in the REAL running app — not just unit tests:
  - UI items: drive the affected views in Chrome via the browser tools, confirm the behaviour and that
    the console shows no new errors. For 419: status pills/badges/banners render correctly in BOTH light
    and dark theme. For 421: menus + buttons show hover/focus/active. For 422: the command palette no
    longer paints above dialogs, modals close on Escape and trap focus. For 420: every field shows a
    visible focus ring and the single switch renders. Navigate from the sprint board (click into views/
    tickets), not by direct URL (direct URLs hit the Clerk redirect). Use the `verify` or `validate-ui`
    skill.

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
when something is genuinely unverifiable by tests or Chrome (a subjective product/visual call, a wrong
default that changes scope, or you can't authenticate Chrome). BATCH questions into one message; keep
working on anything unblocked; never ask permission to start/continue.

Pause, don't thrash: if after a couple of honest attempts an item won't go green, or a shared-file
change (e.g. `InlineAlert.tsx`, `Modal.tsx`, `ticket-action-menu.tsx`, `globals.css` z-index) regresses
unrelated tests and the fix is non-obvious, STOP that item, leave the tree committed-or-clean (never a
half-applied broken edit), note where you're stuck, and continue with the next INDEPENDENT item — but
remember 422 depends on 421, so if 421 is blocked, skip 422 too and jump to 420. Report blocked items at
the end. Never loop indefinitely on the same failure.

At the end, report a summary in Dutch, understandable for a technical PO, concise and to the point:
which items shipped (with commit hashes), which are blocked and why, anything deferred or worth the PO's
attention (especially the visible changes: notifications switch size, button feel, status colors). No
long prose.
```
