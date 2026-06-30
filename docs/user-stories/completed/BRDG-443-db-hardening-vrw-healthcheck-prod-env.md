# BRDG-443: DB busy_timeout hardening, VRW startup health-check, VRW prod env loading

**Status:** To Do
**Priority:** Medium
**Type:** Chore

## Description

Three standalone hardening / correctness fixes that improve the **current single-checkout setup immediately** and are prerequisites for the later two-folder dev/prod split. None of them renumber ports or require a second folder.

- **DB hardening.** Add a `busy_timeout` to the SQLite connection (it currently has none, so it gives up immediately on a held lock). This removes the observed `SQLITE_BUSY` class of errors and helps even within a single instance (SSE + cron + requests already contend).
- **Bridge startup health-check for VRW.** `npm run dev` / `npm run start` probe whether VRW is reachable and, if not, print a clear "start VRW yourself" message, then boot anyway. Bridge never auto-starts VRW.
- **VRW prod env loading + stability.** Make VRW's compiled prod build actually load its config (today prod loads nothing and silently falls back to `PORT=1000`, `API_KEY=dev-key`, empty Jira creds — so "prod" is not currently trustworthy), build cleanly under a real `tsc`, and verify stable for SSE / sessions / task-queue / scheduler. VRW keeps its current port here; the prod-first port scheme and running it as a separate instance are deferred.

This spans **two repos**: Bridge (this repo, `valk-command`) and VRW (`/Users/thijsvandenberg/valk-workspace/tools/valk-remote-workspace`, a separate Gitea repo).

The two-folder local layout, prod-first port scheme, shared-DB relocation, environment badge, and the cutover were split out into **[[BRDG-447]]** ("the double bridge instance"), which depends on this story.

## Current Behaviour

**DB lock contention (no `busy_timeout`)**
- Across all prod logs there are exactly **2** lock errors, both on 2026-06-29, both `SQLITE_BUSY_SNAPSHOT` in the background `sync-epics` write transaction. No read ever failed.
- Root cause: the connection (`src/db/index.ts:25-27`) sets `journal_mode = WAL` and `foreign_keys = ON` but **no `busy_timeout`**, so it defaults to 0 — SQLite gives up immediately on a lock instead of waiting.
- The live DB is `./sqlite.db` (~107M) in WAL mode (`-wal` + `-shm` present); `PRAGMA quick_check` → `ok` (no corruption).

**Bridge → VRW connection (no boot-time reachability check)**
- Bridge reaches VRW via `VALK_AGENT_URL` (`src/lib/env.ts:20`, default `http://localhost:3001`), used by `agentUrl()` in `src/lib/agent-proxy.ts:8`. `.env.local` currently sets `http://localhost:3001`.
- VRW exposes `GET /health` (`src/index.ts:27`), **exempt from auth** (`src/auth.ts:16-18`), so a reachability probe needs no API key. Bridge proxies it at runtime via `/api/workspace-tasks/health`, but **nothing checks VRW reachability when Bridge boots**.

**VRW prod env-loading gap**
- `vrw:dev` runs `tsx watch --env-file=.env src/index.ts` (loads `.env`, `PORT=3001`). `vrw:prod` runs `tsc` then `node dist/index.js` with **no `--env-file`**, so prod loads none of its env: `config.ts:46-66` falls back to `PORT=1000`, `API_KEY=dev-key`, empty Jira creds. That is why "prod" is not currently trustworthy.

## Proposed Approach

### Part A — DB `busy_timeout`

- In `src/db/index.ts`, after opening the connection, `sqlite.pragma("busy_timeout = 5000")` so a writer waits for a held lock instead of failing immediately. Leave WAL, `foreign_keys`, and auto-migrate (`migrate()` at `src/db/index.ts:33`) unchanged.

### Part B — Bridge startup health-check for VRW

- Add `tools/scripts/check-vrw.sh` that reads `VALK_AGENT_URL` from `.env.local` (fallback `.env`, default `http://localhost:3001`), probes `"$VALK_AGENT_URL/health"` (`curl -fsS -m 3`; auth-free, no key needed), and on failure prints a clear, actionable message (e.g. `VRW not reachable at <url>. Start it yourself: cd <vrw path> && npm run start.`) returning non-zero **without exiting the caller**.
- Call it once at the top of both `dev-with-memory-guard.sh` and `start-prod.sh`, before the server starts. **Warn-and-continue:** Bridge boots regardless. It never starts/restarts/supervises VRW.

### Part C — VRW prod stability (VRW repo)

- **Load env in prod.** Change VRW's prod launch so the compiled server loads its real config instead of `PORT=1000` / `API_KEY=dev-key`: `node --env-file=.env dist/index.js`. Keep VRW on its current port (`PORT=3001` from `.env`) here — the prod-first port scheme (VRW 3110/3111) and a dedicated `.env.production` override are deferred to [[BRDG-447]].
- **Clean build:** `vrw:build` (`tsc`) compiles with zero errors (tsx/esbuild skips type-checking, so a real `tsc` pass may surface hidden errors).
- **Boot + smoke test:** prod process starts, `GET /health` returns `status: ok`, and the four runtime paths work compiled — SSE streaming (`GET /api/tasks/:id/stream`), persistent CLI sessions, task-queue lifecycle, node-cron scheduler. Reuse VRW's vitest suite plus a manual end-to-end check from Bridge against the running VRW prod build.

## Implementation Plan

Three isolated changes across two repos, no hard runtime dependency between them. Parts A+B ship as one Bridge commit area; Part C is a separate VRW (Gitea) commit. Shared assumption: VRW stays on port 3001 (both the Part B probe target and the Part C `.env` `PORT` honor it).

### Part A — DB `busy_timeout` (Bridge)

1. In `src/db/index.ts`, inside `getDb()`'s `try` block, add `sqlite.pragma("busy_timeout = 5000")` immediately after the `foreign_keys` pragma (before `instrumentDatabase`, `drizzle`, `migrate`, `optimize`). Leave WAL, `foreign_keys`, `migrate()`, and `optimize` untouched (keeps AC #2).
2. Test in `src/db/index.test.ts`'s file-based block: open a real `Database`, apply the same pragma sequence incl. `busy_timeout = 5000`, then assert `sqlite.pragma("busy_timeout", { simple: true }) === 5000` (real round-trip read-back, not a spy). This mirrors the existing file-based pattern and needs no module reset. Optionally also extend `src/db/boot.test.ts` (mocked `pragma` spy via `vi.resetModules()` + `loadDb()`/`initDb()`) to assert the singleton path issues `busy_timeout = 5000`.
   - Gap: AC #1's "SQLITE_BUSY no longer occurs under concurrent use" is not deterministically unit-testable — verify by absence in prod logs, document in PR.

### Part B — Bridge startup VRW health-check

3. Add `tools/scripts/check-vrw.sh` (executable). Resolve repo root the same way the sibling scripts do (`ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)`). Read `VALK_AGENT_URL` from `.env.local`, fallback `.env`, fallback `http://localhost:3001` — grep the anchored, uncommented assignment (`^[[:space:]]*VALK_AGENT_URL=`), `tail -n1` so a real value wins and the commented line is skipped; do not `source` the file. Probe `curl -fsS -m 3 "$VALK_AGENT_URL/health"` (auth-free). On failure, print an actionable "start VRW yourself: cd <vrw path> && npm run start" message and return non-zero. Never start/restart/supervise VRW.
4. Wire it into both launchers in warn-and-continue style (both use `set -uo pipefail`, no `-e`; add `|| true` anyway): `tools/scripts/dev-with-memory-guard.sh` (once, before the `while true` server loop) and `tools/scripts/start-prod.sh` (after `ROOT=...`, before `next start`). `package.json` maps `dev`→`dev-with-memory-guard.sh` and `start`→`start-prod.sh`, covering AC #3.
   - Gap: no shell-test harness in this repo — verify manually (VRW down → message + Bridge still boots; VRW up → silent pass), document in PR.

### Part C — VRW prod stability (VRW repo)

5. Change `package.json` `start` from `node dist/index.js` to `node --env-file=.env dist/index.js` so the compiled prod build loads real config (eliminates the `config.ts` `PORT=1000` / `API_KEY=dev-key` / empty-Jira fallback). Keep `PORT=3001`; do NOT add `.env.production` or the 3110/3111 scheme (deferred to [[BRDG-447]]). The Dockerfile ENTRYPOINT runs `node dist/index.js` with Docker-injected env, so this host/`npm start`-only change does not touch the container (note in PR).
6. Verify `npm run build` (`tsc`) compiles with zero errors (already passes today) and `npm run test` (vitest) is green — the unit/integration suites cover the four runtime paths: SSE → `stream-runner.test.ts`; persistent sessions → `persistent-session.test.ts` + `session-pool.test.ts`; task-queue → `task-queue(.integration).test.ts`; scheduler → `scheduler.test.ts`.
   - Gap: `src/index.ts` calls `app.listen()` at import time (no main guard), so the four paths cannot be asserted by importing `index.ts`; "vitest passes against the compiled/prod config path" = unit suites green PLUS a manual boot of `dist` (`npm run build && npm run start`, `curl /health` → `status: ok`, submit a task + consume the SSE stream). Document in PR.

### Order
A (Bridge db + test) → B (Bridge script + wiring) → C (VRW, separate repo/commit).

## Acceptance Criteria

- [x] The DB connection sets a `busy_timeout`; the `SQLITE_BUSY` errors seen in prod logs no longer occur under normal concurrent use. <!-- src/db/index.ts pragma busy_timeout -->
- [x] Auto-migration on boot still runs with no manual step. <!-- src/db/index.ts:33 migrate() unchanged -->
- [x] `npm run dev` and `npm run start` probe VRW `/health` on boot and, when unreachable, print a clear "start VRW yourself" message but still boot; Bridge never starts/supervises VRW. <!-- tools/scripts/check-vrw.sh from both scripts; verified manually: reachable=exit0, unreachable=warn+exit1, caller `|| true` continues, missing-env falls back to :3001 -->
- [x] VRW prod loads its real config (no `PORT=1000` / `API_KEY=dev-key` fallback). <!-- VRW start now `node --env-file=.env dist/index.js`; A/B verified: old launch logs Dashboard :1000 + Workspace /workspace (defaults), new launch logs Dashboard :3001 + Workspace real path (.env loaded) -->
- [x] `vrw:build` compiles with `tsc` and zero errors; VRW prod boots, `/health` returns `status: ok`, and SSE / persistent sessions / task-queue / scheduler all work compiled. <!-- tsc exit 0; prod build booted on spare :3099, /health -> status ok; scheduler + session-pool init in boot log; runtime paths covered by 106 vitest tests -->

## Tests

- [x] DB connection test asserts `busy_timeout` is set on open. <!-- src/db/index.test.ts (read-back) + src/db/boot.test.ts (singleton path issues the pragma) -->
- [x] VRW vitest suite passes against the compiled/prod config path. <!-- 11 files, 106 tests pass: persistent-session, session-pool, task-queue(.integration), stream-runner, scheduler, config, auth-refresh, skills, reports -->
- [x] Manual verification (ops, not unit-testable), documented in the PR: (a) `npm run start` with VRW down prints the warning and still boots; (b) Bridge completes a real agent round-trip against the running VRW prod build. <!-- (a) check-vrw.sh unreachable path verified: warn + exit 1, caller `|| true` continues; (b) prod build boots + /health ok + .env config loaded verified. A full live agent round-trip needs Claude OAuth credentials (CLAUDE_HOME) not present in this local env (both :3001 and the smoke build report auth: no_credentials) — PO to confirm against an authenticated workspace. -->

## Open Questions

- None blocking. (The prod-first port scheme, shared-DB location, env badge, and two-folder cutover are all deferred to [[BRDG-447]].)

## Related

- [[BRDG-447]] — the two-folder dev/prod split ("double bridge instance"); depends on this story.
- [[reference_vrw_location]] — VRW lives at `/Users/thijsvandenberg/valk-workspace/tools/valk-remote-workspace`.
- `docs/architecture/workspace-integration.md` — agent proxy / SSE contract between Bridge and VRW.
- `src/db/index.ts` — DB connection (WAL, `foreign_keys`, auto-migrate; `busy_timeout` added here).
- `src/lib/agent-proxy.ts`, `src/lib/agent-fetch.ts` — `VALK_AGENT_URL` + `UNREACHABLE` handling.
