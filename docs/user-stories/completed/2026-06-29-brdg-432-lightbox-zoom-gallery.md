# Handoff: BRDG-432 lightbox zoom, gallery navigation and caption

```text
You are implementing story BRDG-432 (lightbox zoom, gallery navigation and caption) end-to-end, AUTONOMOUSLY, on the `dev` branch of the Bridge (valk-command) project. This prompt is your standing approval to implement it without pausing to ask "shall I start?". Commit your own work as you go, track progress, archive the finished story, and only finish once it is genuinely green. Keep going until it is done or you hit a real blocker.

Read first: `CLAUDE.md` (project + global rules); the story file `docs/user-stories/BRDG-432-lightbox-zoom-and-gallery.md` in full; and the current component `src/components/shared/ImageLightbox.tsx` plus its test `src/components/shared/ImageLightbox.test.tsx` before you start.

Scope & order (single story):
1. BRDG-432 — add zoom/pan, optional gallery navigation (prev/next + arrow keys + counter) and a filename/alt caption to the custom lightbox. Files: `src/components/shared/ImageLightbox.tsx` (core), `src/components/ticket-detail/AttachmentsSection.tsx` (wire the attachments list + index into each thumbnail's lightbox), and tests alongside both.
   - There is NO third-party lightbox library and you must NOT add one — extend the existing custom component natively (the project uses custom Tailwind, no component library).
   - The `gallery` support must be OPTIONAL: when no gallery list is passed (e.g. the markdown image call sites in `src/components/ticket-detail/renderMarkdown.tsx`), behaviour must match today exactly — single image, no nav controls, no counter. Do NOT touch renderMarkdown.tsx beyond confirming it still compiles/works; grouping markdown images into a gallery is explicitly out of scope (see the story's Open Questions).
   - Follow the story's Open Questions defaults: navigation clamps at the ends (buttons disabled at first/last, no wrap); markdown images stay single.

The loop:
1. Read the story. It has an "Open Questions" section with recommended defaults — follow the recommendations; do not stop to ask unless a default proves wrong/blocking once you're in the code.
2. Implement it. You may use the `/implement-story` command as the harness. This is a UI feature addition: preserve all existing lightbox behaviour (Escape / backdrop / close button dismiss, body-scroll lock, single-image call sites); the tests are your guardrail; do not change behaviour beyond scope.
3. This changes visuals (zoom controls, nav buttons, counter, caption) — invoke the `frontend-design` skill first (global rule). Animate only `transform`/`opacity`, spring-style easing, never `transition-all`; every clickable control needs hover/focus-visible/active states and `cursor: pointer`; reuse the `z-modal` z-index token and existing color tokens rather than hard-coding.
4. Write/extend co-located tests in `ImageLightbox.test.tsx` (and an `AttachmentsSection.test.tsx` if you add gallery-wiring assertions there) for every change — see the story's Tests checklist.
5. Verify it ACTUALLY works (see Definition of done).
6. Commit (conventional commit referencing BRDG-432; English; no emojis; NO "Co-Authored-By"). Stage EXPLICIT paths only — never `git add -A`/`.`; the working tree carries unrelated parallel work. Several commits is fine.
7. Tick the story's checkboxes as you satisfy them; when all acceptance criteria + tests are met, add a short "## Status" run note at the top, then archive the story: `git mv docs/user-stories/BRDG-432-lightbox-zoom-and-gallery.md docs/user-stories/completed/` and commit `chore: archive BRDG-432 as completed`.

Definition of done (must ALL hold before finishing):
- `npm run lint`, `npm run typecheck`, `npx vitest run` (FULL suite), and `npm run build` all green.
- The story's acceptance criteria are met.
- It is E2E-verified in the REAL running app — not just unit tests. Open a ticket that has multiple image attachments, open the lightbox from a thumbnail, and confirm: scroll/trackpad zoom + drag-to-pan work; double-click toggles zoom; arrow keys and the prev/next buttons move between attachments with a correct "n / total" counter (disabled at the ends); the filename caption shows; reset-on-close/on-navigate works; and the console shows no new errors. Use the `verify` or `validate-ui` skill. Navigate from the sprint board (click into a ticket), not by direct URL (direct URLs hit the Clerk redirect).

Hard rules (non-negotiable):
- TESTS: `npx vitest run` in the FOREGROUND, ONE process at a time, no pipes, no background, no sleep+cat polling. 16GB machine — concurrent vitest thrashes swap. A postToolUse hook may auto-run tests after edits; let it finish, don't overlap it.
- Run lint + typecheck + test + build before EVERY commit.
- DEV SERVER on port 3100 for Chrome checks: `curl -s localhost:3100` to see if it's up before starting; never start a second instance; never background it with `&`. After any `npm run build`, RESTART it (`lsof -ti:3100 | xargs kill -9 2>/dev/null` then `npm run dev`).
- BRANCHES: do NOT create/switch branches (a PreToolUse hook blocks it). Commit directly to `dev`. No PR unless asked.
- Conventional commits, English only, no emojis, no "Co-Authored-By". Update `/docs` if behaviour/architecture changes.

Chrome / auth: the app is Clerk-gated. First check existing browser tabs and reuse an already-authenticated Bridge tab if one is open; otherwise use the development auth bypass (check `src/middleware.ts` and `src/app/api/dev/` / `src/app/dev/` — a dev-only httpOnly cookie). If neither works, that's a valid reason to ask the PO to log in once in the tab you're driving. Never trigger native alert/confirm dialogs (they freeze the automation).

Ask the PO sparingly: decide for yourself using the story's recommended defaults and the tests. Only ask when something is genuinely unverifiable by tests or Chrome (a subjective visual call, a wrong default that changes scope, or you can't authenticate Chrome). BATCH questions into one message; keep working on anything unblocked; never ask permission to start/continue.

Pause, don't thrash: if after a couple of honest attempts it won't go green, or a change regresses unrelated tests and the fix is non-obvious, STOP, leave the tree committed-or-clean (never a half-applied broken edit), and report where you're stuck. Never loop indefinitely on the same failure.

When done: archive this handoff prompt itself — `git mv docs/prompts/2026-06-29-brdg-432-lightbox-zoom-gallery.md docs/user-stories/completed/` and commit `chore: archive handoff prompt brdg-432-lightbox-zoom-gallery`. Skip this only if the story is still blocked (leave the prompt in place so the next run can pick it up).

At the end, report a summary in Dutch, understandable for a technical PO, concise and to the point: what shipped (with commit hashes), anything blocked and why, anything deferred or worth the PO's attention. No long prose.
```
