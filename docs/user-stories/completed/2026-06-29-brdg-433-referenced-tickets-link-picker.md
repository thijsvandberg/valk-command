# Handoff: BRDG-433 — surface referenced tickets in the Link-issue picker

```text
You are implementing story BRDG-433 (surface already-referenced tickets in the Link-issue picker) end-to-end, AUTONOMOUSLY, on the `dev` branch of the Bridge (valk-command) project. This prompt is your standing approval to implement it fully without pausing to ask "shall I start?". Commit your own work as you go, track progress, archive the story when done, and only finish once it is genuinely green. Keep going until it is done or you hit a real blocker.

**Read first:** `CLAUDE.md` (project + global rules); the story file `docs/user-stories/BRDG-433-referenced-tickets-in-link-picker.md` IN FULL; and skim the three files the picker already uses so your changes match their idioms: `src/components/ticket-detail/LinkIssueDialog.tsx`, `src/hooks/useLinkIssueSearch.ts`, `src/components/ticket-detail/LinkSearchResultRow.tsx`. Also read `src/app/api/tickets/search/route.ts` (its `mapRow()` is the row-shape your new endpoint must mirror) and `src/lib/jql.ts` (`JIRA_KEY_RE`, the single-key validator your new multi-match helper derives from). No board-edit / optimistic-update concerns here.

**Scope & order (single story, do the phases in this order — each phase builds on the previous, so keep it sequential):**
1. Pure helper: add `extractIssueKeys(text)` in `src/lib/issue-keys.ts` (global match `/[A-Z][A-Z0-9]+-\d+/gi`, uppercase, dedupe, first-seen order; matches bare keys and keys inside Jira browse URLs). Co-located `src/lib/issue-keys.test.ts`.
2. Endpoint: `GET /api/tickets/[key]/referenced-issues` — read the source ticket's `description` + all `jiraComment.content` + all `poComment.content` from the local DB, run `extractIssueKeys`, EXCLUDE the ticket's own key and any key already in `ticketLink` for this ticket, resolve the rest against the local `ticket` table and DROP keys with no known ticket. Return `{ results: LinkSearchResult[] }` shaped exactly like `mapRow()` produces, `private, no-store`. Add a route test.
3. API client + hook: add `tickets.referencedIssues(key)` in `src/lib/api-client.ts`; in `src/hooks/useLinkIssueSearch.ts` add a parallel mount fetch populating new state `referencedResults: LinkSearchResult[]`, exposed on `UseLinkIssueSearchReturn` (mirror the existing `recentResults` effect at lines ~133-141).
4. UI: in `LinkIssueDialog.tsx`, inside the default (no query, no filter) branch (~lines 347-371), render a `REFERENCED IN THIS TICKET` block ABOVE the `RECENTLY UPDATED` block, reusing `LinkSearchResultRow` + `HoverDataProvider` and the same `text-caption uppercase tracking-widest` header style (distinct lucide icon, e.g. `Link2`/`Quote`). Hide the block when `referencedResults` is empty. DE-DUPE: filter the recently-updated list to drop any key present in `referencedResults` (referenced wins — no ticket shows twice); feed the de-duped recent list to BOTH render and keyboard highlight indexing, and make highlight traversal span referenced rows THEN recent rows in visual order.

Couplings/cautions: steps 2-4 are sequential (each depends on the prior). The working tree may carry unrelated parallel work — stage EXPLICIT paths only, never `git add -A`/`.`. Decided behaviour locked in the story: NO special relation (one-click add uses the existing `relates to` default), NO duplicates, do NOT show already-linked tickets. The only open question is cosmetic (the section label wording `REFERENCED IN THIS TICKET`) — keep the drafted label; do not stop for it.

**The loop:**
1. Re-read the story. Follow its decided behaviour; the single Open Question is cosmetic — keep the drafted label.
2. Implement the phase. You may use the `/implement-story` command as the harness. This is a feature: preserve existing picker behaviour; the tests are your guardrail; do not change behaviour beyond scope.
3. The UI phase changes visuals — invoke the `frontend-design` skill FIRST (global rule).
4. Write/extend co-located `*.test.ts(x)` for every change.
5. Verify it ACTUALLY works (see "Definition of done").
6. Commit (conventional commit referencing BRDG-433; English; no emojis; NO "Co-Authored-By"). Stage EXPLICIT paths only. Several commits is fine.
7. Tick the story's checkboxes as satisfied; when all met, add a short "## Status" run note at the top and archive it: `git mv docs/user-stories/BRDG-433-referenced-tickets-in-link-picker.md docs/user-stories/completed/` and commit `chore: archive BRDG-433 as completed`.

**Definition of done (must ALL hold before you finish):**
- `npm run lint`, `npm run typecheck`, `npx vitest run` (FULL suite), and `npm run build` all green.
- The story's acceptance criteria are met.
- E2E-verified in the REAL running app, not just unit tests: open a ticket whose description and/or a comment mentions another VPL key, open the Link-issue picker, confirm the `REFERENCED IN THIS TICKET` section appears above `RECENTLY UPDATED` with the right tickets, that an already-linked ticket is absent, that a ticket in both lists shows only once at the top, and that clicking a referenced row creates the link. Console shows no new errors. Navigate from the sprint board (click into a ticket) — not by direct URL (direct URLs hit the Clerk redirect). Use the `verify` or `validate-ui` skill.

**Hard rules (non-negotiable):**
- TESTS: `npx vitest run` in the FOREGROUND, ONE process at a time, no pipes, no background, no sleep+cat polling. 16GB machine — concurrent vitest thrashes swap. A postToolUse hook may auto-run tests after edits; let it finish, don't overlap it.
- Run lint + typecheck + test + build before EVERY commit.
- DEV SERVER on port 3100 for Chrome checks: `curl -s localhost:3100` first to see if it's up; never start a second instance; never background it with `&`. After any `npm run build`, RESTART it (`lsof -ti:3100 | xargs kill -9 2>/dev/null` then `npm run dev`).
- BRANCHES: do NOT create/switch branches (a PreToolUse hook blocks it). Commit directly to `dev`. No PR unless asked.
- Conventional commits, English only, no emojis, no "Co-Authored-By". Update `/docs` if behaviour/architecture changes (e.g. the API-routes doc gets the new endpoint).

**Chrome / auth:** the app is Clerk-gated. First check existing browser tabs and reuse an already-authenticated Bridge tab if one is open; otherwise use the development auth bypass (check `src/middleware.ts` and `src/app/api/dev/` / `src/app/dev/` — a dev-only httpOnly cookie; `GET /api/dev/bypass`). If neither works, that's a valid reason to ask the PO to log in once in the tab you're driving. Never trigger native alert/confirm dialogs (they freeze the automation). Good test data: VPL-1337 is a dedicated safe test story.

**Ask the PO sparingly:** decide for yourself using the story's decided behaviour and the tests. Only ask when something is genuinely unverifiable by tests or Chrome (a subjective visual call, or you can't authenticate Chrome). BATCH questions into one message; keep working on anything unblocked; never ask permission to start/continue.

**Pause, don't thrash:** if after a couple of honest attempts a phase won't go green, leave the tree committed-or-clean (never a half-applied broken edit), note where you're stuck, and report it. Never loop indefinitely on the same failure.

**When the story is done:** archive this handoff prompt itself — `git mv docs/prompts/2026-06-29-brdg-433-referenced-tickets-link-picker.md docs/user-stories/completed/` and commit `chore: archive handoff prompt brdg-433-referenced-tickets-link-picker`. Skip this if the story is still blocked (leave the prompt in place).

**At the end, report a summary in Dutch, understandable for a technical PO, concise and to the point:** what shipped (with commit hashes), anything blocked and why, anything deferred or worth the PO's attention. No long prose.
```
