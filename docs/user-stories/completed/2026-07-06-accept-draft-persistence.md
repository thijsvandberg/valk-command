# Handoff prompt — BRDG-483 accept-draft persistence

Paste the block below into a fresh Claude Code thread in the `valk-command` project to run autonomously.

```text
You are implementing story BRDG-483 (accept-draft "Accepted" state does not survive a refresh) end-to-end, AUTONOMOUSLY, on the `dev` branch of the Bridge (valk-command) project. This prompt is your standing approval to implement it without pausing to ask "shall I start?". Commit your own work as you go, track progress, archive the story when done, and keep going until it is done or you hit a real blocker.

Read first: `CLAUDE.md` (project + global rules); the story `docs/user-stories/BRDG-483-accept-draft-accepted-state-not-persistent.md` in full; `docs/architecture/story-writer.md` (the draft / accept flow and the pane/app system). This is a SHARED-component bug: the fix lives in `src/components/story-writer/ChatMessageParts.tsx`, used by BOTH the single-story Story Writer and the Epic Writer.

Scope & order (single item):
1. BRDG-483 — make the accepted-draft state persist across a refresh — `docs/user-stories/BRDG-483-accept-draft-accepted-state-not-persistent.md`. The accepted CONTENT already persists (`acceptDraft` writes `localDraft` + a description local-edit); only the visual "Accepted" marker resets because `draftAccepted` in `ChatMessageParts.tsx` is client-only `useState(false)`. Fix: derive the accepted state from persisted data — a draft is accepted when its content matches the session's saved `localDraft` (or `targetLocalDraft` for the target slot, keyed off the draft's `story_slot`). Prefer this no-migration approach; only add an `accepted_draft_id` column if content-matching proves genuinely ambiguous.

Cautions (respect exactly):
- SHARED FILE CONFLICT: `ChatMessageParts.tsx` is ALSO edited by the BRDG-478/BRDG-484 handoff (`docs/prompts/2026-07-06-epic-writer-478-484.md`: empty-bubble suppression + epic-tag stripping). DO NOT run this handoff at the same time as that one — same file, sequential only. Before you start, `git pull`/check `dev` is up to date and run the FULL suite once to confirm a green baseline; if that other work is mid-flight and uncommitted in the tree, stop and report rather than editing a half-changed file.
- Do NOT change what accepting a draft persists (the content save already works). Only make the accepted STATE derive from persisted data.
- The change must be correct in BOTH the Story Writer (`/tickets/<key>/write`, including split-mode target slot) and the Epic Writer (`/epics/<key>/write`). Do not regress either.

The loop:
1. Read the story. Follow its recommended approach (content-match inference, no migration) unless it proves wrong/blocking once you're in the code.
2. Implement it. You may use the `/implement-story` command as the harness. This is a bug fix: preserve existing behaviour except the specific defect; the tests are your guardrail; do not change behaviour beyond scope.
3. If anything visual changes, invoke the `frontend-design` skill first (global rule).
4. Write/extend co-located `*.test.ts(x)` tests: accepted-vs-not derivation, per slot (original + target), and that a superseded/not-yet-accepted draft still shows the Accept button.
5. Verify it ACTUALLY works (the bar to advance — see "Definition of done").
6. Commit (conventional commit referencing BRDG-483; English; no emojis; NO "Co-Authored-By"). Stage EXPLICIT paths only — never `git add -A`/`.` (the tree carries unrelated parallel work, including some deleted story docs — never stage those). Several commits are fine.
7. Tick the story's checkboxes as you satisfy them; when all are met, add a short "## Status" run note at the top and archive it: move `docs/user-stories/BRDG-483-accept-draft-accepted-state-not-persistent.md` to `docs/user-stories/completed/` and commit `chore: archive BRDG-483 as completed`.

Definition of done (must ALL hold):
- `npm run lint`, `npm run typecheck`, `npx vitest run` (FULL suite), and `npm run build` all green.
- The story's acceptance criteria are met.
- E2E-verified in the REAL running app, not just unit tests: in Chrome, accept a draft in the Story Writer, HARD-REFRESH, and confirm the draft still shows "Accepted" with no Accept button; confirm a not-yet-accepted draft still offers Accept; repeat the accept-then-refresh check in the Epic Writer. Console shows no new errors. Navigate from the sprint board (click into a ticket / open the epic writer), not by direct URL (direct URLs hit the Clerk redirect). Use the `verify` or `validate-ui` skill.

Hard rules (non-negotiable):
- TESTS: `npx vitest run` in the FOREGROUND, ONE process at a time, no pipes, no background, no sleep+cat polling. 16GB machine — concurrent vitest thrashes swap. A postToolUse hook may auto-run tests after edits; let it finish, don't overlap it.
- Run lint + typecheck + test + build before EVERY commit.
- DEV SERVER on port 3101 for Chrome checks (prod is 3100): `curl -s localhost:3101` to see if it's up before starting; never start a second instance; never background it with `&`. After any `npm run build`, RESTART it (`lsof -ti:3101 | xargs kill -9 2>/dev/null` then `npm run dev`).
- BRANCHES: do NOT create/switch branches (a PreToolUse hook blocks it). Commit directly to `dev`. No PR unless asked.
- Conventional commits, English only, no emojis, no "Co-Authored-By". Update `/docs` when behaviour/architecture changes.

Chrome / auth: the app is Clerk-gated. First check existing browser tabs and reuse an already-authenticated Bridge tab if one is open; otherwise use the development auth bypass (`GET /api/dev/bypass` on the dev server; check `src/middleware.ts` and `src/app/api/dev/` / `src/app/dev/` — a dev-only httpOnly cookie). `VPL-47279` is a real epic with an active session; any real ticket with a story-writer draft works for the Story Writer check. If auth can't be established, that's a valid reason to ask the PO to log in once in the tab you're driving. Never trigger native alert/confirm dialogs (they freeze the automation).

Ask the PO sparingly: decide for yourself using the story's recommended default and the tests. Only ask when something is genuinely unverifiable by tests or Chrome (a subjective call, a wrong default that changes scope, or you can't authenticate Chrome). BATCH questions into one message; keep working on anything unblocked; never ask permission to start/continue.

Pause, don't thrash: if after a couple of honest attempts it won't go green, or the shared `ChatMessageParts.tsx` change regresses unrelated Story Writer tests and the fix is non-obvious, STOP, leave the tree committed-or-clean (never a half-applied broken edit), note where you're stuck, and report. Never loop indefinitely on the same failure.

When done: archive this handoff prompt itself — `git mv docs/prompts/2026-07-06-accept-draft-persistence.md docs/user-stories/completed/` and commit `chore: archive handoff prompt accept-draft-persistence`. Skip this if the story is blocked (leave the prompt in place so the next run can pick it up).

At the end, report a summary in Dutch, understandable for a technical PO, concise and to the point: what shipped (with commit hash), anything blocked and why, anything deferred or worth the PO's attention. No long prose.
```
