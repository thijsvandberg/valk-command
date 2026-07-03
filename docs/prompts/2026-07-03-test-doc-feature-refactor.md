# Handoff: test-doc feature refactor (code + design + component reuse)

Generated 2026-07-03 from the BRDG-426/461 build thread. Paste the block below into a fresh agent thread.

```text
You are refactoring the stakeholder test-documentation feature (shipped as BRDG-426 + BRDG-461) end-to-end, AUTONOMOUSLY, in three phases, on the `dev` branch of the Bridge (valk-command) project. This prompt is your standing approval to do all three phases without pausing to ask "shall I start?". Commit your own work as you go, track progress, and only advance once the current phase is genuinely green. Keep going until all phases are done or you hit a real blocker.

This is a REFACTOR of a working, shipped feature. The feature grew through ~20 rapid PO-feedback iterations in one day, so structure, styling and component reuse lag behind the behaviour. Behaviour is correct and covered by tests; preserve it exactly unless a phase explicitly allows a visual change.

**Read first:** `CLAUDE.md` (project + global rules); `docs/user-stories/completed/BRDG-426-generate-test-doc.md` (including the "Post-ship enhancements" ledger — it lists every iteration); `docs/user-stories/completed/BRDG-461-sprint-test-doc-delivery.md`; the "Stakeholder test documentation" section of `docs/architecture/workspace-integration.md` (the authoritative behaviour spec); `docs/architecture/optimistic-updates.md`; and every file in the feature surface below before you change it.

**The feature surface (all paths relative to repo root):**
- Components (sprint-board): `src/components/sprint-board/TestDocReviewModal.tsx` (+ `.test.tsx`; ~800 lines, the main refactor target), `TestDocStoryPane.tsx`, `TestDocMarker.tsx` (+ test), `SprintTestDocsModal.tsx` (+ test), `useTestDocBoard.ts`, and the test-doc parts of `StatusChangeLine.tsx` (+ test), `BoardRow.tsx`, `TicketTable.tsx`, `SprintBoard.tsx`, `SprintDetailsPopover.tsx` ("Test documentation" menu item), `BoardFieldToggle.tsx` (disabledIds), `filter-bar-types.ts` (the `testDoc` tag).
- Ticket detail: the "Test doc" row in `src/components/ticket-detail/TicketMetaContent.tsx`.
- Lib: `src/lib/test-doc.ts`, `src/lib/parse-test-doc.ts`, `src/lib/test-doc-background.ts`, `src/lib/test-doc-prefetch.ts` (each with tests), plus `shouldAutoEnableTestDocTag` / `readTestDocTagSprints` / `persistTestDocTagSprints` in `src/components/sprint-board/sprint-board-utils.ts`.
- API: `src/app/api/tickets/[key]/generate-test-doc/route.ts`, `src/app/api/tickets/[key]/test-doc/route.ts` (GET + PUT incl. notNeeded branch), `src/app/api/tickets/[key]/test-doc-draft/route.ts`, `src/app/api/sprints/[id]/test-docs/route.ts` (all with tests); `testDocState` mapping in `src/app/api/tickets/route.ts` and `src/lib/ticket-detail-builder.ts`.
- VRW skill (SEPARATE repo, only if phase 2 finds prompt-wording issues): `/Users/thijsvandenberg/valk-workspace/tools/valk-remote-workspace/.claude/skills/generate-test-doc.md`. Prompt-only edits need no rebuild (loaded per task); registry changes (`src/skills.ts`) need `npm run build` in that repo + a restart of the VRW on :3110. Commit there separately.

**Behavioural invariants you must NOT change (all covered by tests and documented in workspace-integration.md):**
- Bulk prefetch: max 3 concurrent generations, rolling; closing mid-queue cancels in-flight tasks.
- Draft cache: every completed generation persists as `test_doc_draft*` (client write + server-side `after()` capture in `test-doc-background.ts`); accepting clears the draft; the BRDG-461 bundle only reads ACCEPTED docs.
- View mode (`autoGenerate: false` — marker, status line, meta row, bundle Edit): opening the modal NEVER silently starts an agent task; idle state with an explicit Generate button.
- Background generation from the status line: fire-and-forget, "Generating…" state holds until the board rows actually reflect the new state, then "View test doc".
- "No test doc needed": Bridge-only marker (`not_stakeholder_relevant`, no doc, no Jira write); bundle lists these separately; missing overview skips them; deprecated tickets are excluded everywhere.
- Per-sprint marker visibility (`bridge:test-doc-tag-sprints`), last-working-day auto-reveal (once per sprint, `bridge:test-doc-tag-auto:<id>`), disabled checkbox on the All view.
- Save path: Bridge copy FIRST, then exactly one `:::expand Test documentation` block via `upsertLocalEdit` + `pushToJira` (replace, never duplicate); conflict is a valid outcome; draft keys 409.
- Versioned regeneration (chips + Compare, Save accepts the ACTIVE version), needs_input blocks Save until edited, unsaved-draft warning, quiet "Saved <date>" stamp, staleness warning via story-version timestamp with the 10-minute save-echo margin.
- Bundle: buckets documented/internal(Misc)/notNeeded/missing/other; copy uses JIRA links behind titles, the in-app view uses BRIDGE links; edit round-trip returns to the (refreshed) bundle; splitter width persists per browser (`bridge:test-doc-split`).
- Known limitation to leave alone: descriptions near Jira's ~32.7k cap fail the push with CONTENT_LIMIT_EXCEEDED (documented in the archived BRDG-426 story).

**Phases (do them in this order):**

1. **Audit + plan.** Read the whole surface, then write `docs/investigations/2026-07-03-test-doc-refactor.md`: what you found (duplication, dead code, oversized components, inconsistent styling, hand-rolled UI that shadows existing primitives), and a checklist of the changes you will make in phases 2–3 with a keep/change verdict per finding. This document is your progress tracker for the rest of the run — tick items as you land them. No code changes in this phase. Commit the doc.

2. **Code refactor (no visual changes).** Structure and dedup only; the full suite must stay green with NO test-behaviour changes (test-file mechanics may move). Known candidates to evaluate (verify against the code, don't assume): `TestDocReviewModal.tsx` is ~800 lines — extract the left doc pane (toolbar + version chips + compare + editor/preview) and/or the entry/queue state machine into their own files or a hook; the repeated caption-button and chip styles; the three near-identical modal-header blocks across `TestDocReviewModal`, `SprintTestDocsModal` and `AddSubtasksModal.tsx` (a shared modal-header helper may pay off — check other modals first); duplicated "needs input"/"draft ready" badge markup; the two `testDocState` derivations (list route + detail builder) that must stay in sync — consider one shared helper; route-level duplication across the three test-doc routes (draft-key guard + ticket-exists check). Also sweep for dead code and stale comments left by the iterations.

3. **Design + UX component-reuse refactor (visual changes allowed).** Invoke the `frontend-design` skill FIRST (global rule), then bring the feature visually in line with the Bridge design system: reuse the shared primitives (`Button`, `MenuItem`, `Checkbox`, `InlineAlert`, `Modal`, `StatusBadge`, `TicketStatusPill`, `EpicBadge`, `Avatar` — see the BRDG-419/420/421/422 conventions in the codebase) instead of hand-rolled lookalikes; consistent typography/spacing tokens between the two modals; check both light and dark themes. PO preferences that are hard constraints: NO focus ring/glow on text inputs (subtle brand border only; keyboard focus-visible rings on buttons stay); no default Tailwind blue/indigo; no `transition-all`; every clickable element needs hover/focus-visible/active states and `cursor: pointer`. Judge and improve: visual hierarchy inside the review modal (alerts vs toolbar vs editor), the bundle modal's section rhythm (missing/blocks/Misc/notNeeded/other), and the empty/loading states. Keep the interaction model exactly as-is — this phase changes presentation, not flow. Update `data-testid`s and tests together if markup moves.

**The loop for each phase:**
1. Implement the phase; tick its checklist items in the investigation doc as you go.
2. Write/extend co-located `*.test.ts(x)` tests for anything you change; keep the existing ~60 feature tests meaningful (update them WITH markup changes, never delete coverage).
3. Verify it ACTUALLY works (see "Definition of done").
4. Commit per logical unit (conventional commit referencing BRDG-426/461; English; no emojis; NO "Co-Authored-By"). Stage EXPLICIT paths only — never `git add -A`/`.` (the tree carries unrelated parallel work: inbox-digest files, `.claude/commands/`, do NOT touch or stage those).
5. Only then move to the next phase.

**Definition of done (must ALL hold before advancing a phase):**
- `npm run lint`, `npm run typecheck`, `npx vitest run` (FULL suite), and `npm run build` all green.
- Behavioural invariants above still hold (the feature tests prove most of them).
- E2E-verified in the REAL running app, not just unit tests: drive the sprint board in Chrome via the available browser tools (use the `verify` or `validate-ui` skill). Minimum flow to walk: open a sprint → toggle the Test documentation field in Display → click a marker (modal opens WITHOUT generating) → open the sprint "..." menu → Test documentation bundle → Edit a block → back to bundle. Use ticket VPL-1337 for anything that writes (it is the designated safe test ticket, Jira writes allowed); do NOT save docs on other real tickets. Navigate from the sprint board (not direct URLs — Clerk redirect); confirm no new console errors.
- `docs/architecture/workspace-integration.md` updated wherever the refactor moves files or renames concepts.

**Hard rules (non-negotiable):**
- TESTS: `npx vitest run` in the FOREGROUND, ONE process at a time, no pipes, no background, no sleep+cat polling. 16GB machine — concurrent vitest thrashes swap. A postToolUse hook may auto-run tests after edits; let it finish, don't overlap it.
- Run lint + typecheck + test + build before EVERY commit.
- DEV SERVER on port 3101 for Chrome checks (prod is 3100): `curl -s localhost:3101` to see if it's up before starting; never start a second instance; never background it with `&`. After any `npm run build`, RESTART it (`lsof -ti:3101 | xargs kill -9 2>/dev/null` then `npm run dev`).
- BRANCHES: do NOT create/switch branches (a PreToolUse hook blocks it). Commit directly to `dev`. No PR unless asked.
- React Compiler lint rules are build-blocking: no synchronous setState in effects (use event handlers or justify an eslint-disable), no ref writes during render.
- Conventional commits, English only, no emojis, no "Co-Authored-By". Update `/docs` when behaviour/architecture changes. Never delete files — move superseded ones to `deleted/` at the repo root.

**Chrome / auth:** the app is Clerk-gated. First check existing browser tabs and reuse an already-authenticated Bridge tab if one is open; otherwise use the development auth bypass: navigate to `http://localhost:3101/api/dev/bypass` (dev-only httpOnly cookie; re-hit it if you land on /login). Never trigger native alert/confirm dialogs (they freeze the automation).

**Ask the PO sparingly:** decide for yourself using this prompt, the invariants and the tests. Only ask when something is genuinely unverifiable (a subjective visual call with two equally defensible options, or you cannot authenticate Chrome). BATCH questions into one message; keep working on anything unblocked; never ask permission to start/continue.

**Pause, don't thrash:** if after a couple of honest attempts a change won't go green, or a shared-file change regresses unrelated tests and the fix is non-obvious, STOP that change, leave the tree committed-or-clean (never a half-applied broken edit), note it in the investigation doc, and continue with the next independent item. Report blocked items at the end. Never loop indefinitely on the same failure.

**When every phase is done:** finish the investigation doc with a short results section (what changed, what was deliberately kept, before/after line counts of the main files), then archive this handoff prompt itself — `git mv docs/prompts/2026-07-03-test-doc-feature-refactor.md docs/user-stories/completed/` and commit `chore: archive handoff prompt test-doc-feature-refactor`. Skip the archive if anything is still blocked (leave the prompt in place so the next run can pick it up).

**At the end, report a summary in Dutch, understandable for a technical PO, concise and to the point:** what was refactored (with commit hashes), which design/UX improvements shipped, what was deliberately left alone and why, anything blocked or worth the PO's attention. No long prose.
```
