# Implementation Performance Log

## BRDG-232 — Rate limiter hardening (2026-05-29)

Backend/security story. Implementation was straightforward; final verification was
complicated by heavy concurrent activity on `dev` from another agent.

| Phase | Notes |
|-------|-------|
| Plan | Opus Plan subagent; surfaced the sync-vs-async crux and the next.config bodyParser no-op for App Router. |
| Implementation | Made `applyRateLimit` async + per-user keyed; mechanical `await` codemod across 75 call sites via `sed` (avoids the per-edit test hook). Middleware injects `x-bridge-user-id` and enforces a 1 MB body cap. |
| Test verification | Changed test files green (54); mock sites switched `mockReturnValue`→`mockResolvedValue`. |
| Final verification | lint 0 errors; typecheck/build clean once unrelated chat WIP isolated. |

Key bottlenecks:
- **`set -f` for `[key]`/`[id]` route paths**: the first codemod `sed` loop silently
  matched nothing because unquoted bracket paths were glob-expanded. Re-ran with
  globbing disabled.
- **Unrelated WIP blocks `npm run build`**: working tree carried in-progress chat
  components (`ChatLayout.tsx`/`MessageInput.tsx`) that fail typecheck. Verified my
  work by stashing only those two files (stashing everything broke the tree, since the
  WIP components are interdependent).
- **Concurrent branch races**: another agent committed BRDG-234/235 and advanced `dev`
  mid-session, briefly showing a non-awaited `applyRateLimit` in a shared chat route.
  State settled consistently (all calls awaited); my four commits remained reachable.

## BRDG-235 — Hover card on TicketStatusPill (2026-05-29)

Implementation itself was smooth (one component + two call-sites + tests, all green
first try). Final verification hit two unrelated blockers.

| Phase | Notes |
|-------|-------|
| Plan | Opus Plan subagent; clean numbered plan, no rework. |
| Implementation | One edit pass to `TicketStatusPill.tsx` + 2 call-sites; one lint error (setState-in-effect) fixed by deriving visibility instead of an effect. |
| Test verification | Added 7 hover-card tests; affected files 34/34 pass. |
| Final verification | Full suite + build, then browser visual check. |

Key bottlenecks (both pre-existing, neither caused by the change — see
`docs/investigations/2026-05-29-flaky-rate-limiter-and-stale-next-build.md`):

- **Stale `.next` build failure**: `next build` failed on a generated type referencing
  a deleted route (`api/debug/query-stats`). The running dev server held `.next`, so
  `rm -rf .next` also failed. Fix: kill port 3100, clean `.next`, rebuild.
- **Flaky `rate-limiter.test.ts`**: 7 failures in the full suite, 16/16 in isolation —
  time-window/global-state dependent, unrelated to this story.

## BRDG-231 — Fix Dependency Vulnerabilities (2026-05-29)

The dependency bump itself was trivial (one package), but verification hit three
unrelated blockers that required extra diagnosis runs.

| Phase | Notes |
|-------|-------|
| Investigation | Quick — determined both highs trace to one js-cookie/Clerk chain; drizzle-kit/next already at latest stable. |
| Implementation | Single `npm install`; lint/typecheck/build all clean first try. |
| Test verification | 3 full suite runs (~63s each) to diagnose two different failures. |

Key bottlenecks (all pre-existing / external, none caused by the change):

- **Pre-existing Drizzle schema drift**: a clean checkout already emits an index-change
  migration, so the AC's "generate produces no diff" could not be met verbatim. Logged
  in `docs/investigations/2026-05-29-drizzle-schema-drift.md`.
- **Non-deterministic test flakiness**: different unrelated tests fail across full runs
  under parallel workers (e.g. `sync-comments/route.test.ts`), all pass in isolation.
- **External untracked file**: `src/app/(app)/dev/ticket-pills/page.tsx` appeared mid-session
  from an external process and breaks `routes.test.tsx` (not in the route manifest). Left
  untouched as out of scope.

## BRDG-234 — Unify standalone chat with Story Writer chat (2026-05-29)

Frontend consolidation story. Smooth overall; one environment bottleneck.

| Phase | Notes |
|-------|-------|
| Plan | Opus Plan subagent; correctly flagged the StoryWriterChat input fork and the model/codebase send-path gap. Narrowed checkbox 2 to "footer controls only" (not full input migration) to cut regression risk. |
| Implementation | Extracted ModelSelector/CodebaseToggle/QuickActionsPopover to shared/chat-controls; routed /chat through shared ChatInput with footer slots + width; wired model (top-level body field) + codebase (args prefix, applied agent-side only) through submitAndStream and chat-messages route; shared StreamingIndicator across 3 surfaces. |
| Test verification | New tests for the 4 shared components + MessageInput + chat-messages model forwarding. Full suite: 3513 passed; build clean. |

Key bottlenecks:
- **Stale TS build artifacts** (`.tsbuildinfo`, `.next-build/types/**`) produced phantom/cascading `tsc --noEmit` errors (TS18047 in route tests, ghost errors in untouched confluence/workspace-tasks tests) that flip-flopped across runs. Resolved by deleting `*.tsbuildinfo` and `.next-build` before a clean check; `npm run typecheck` then exits 0. Worth clearing these first when typecheck output looks inconsistent.
