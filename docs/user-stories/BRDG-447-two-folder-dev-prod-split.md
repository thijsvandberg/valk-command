# BRDG-447: Two-folder dev/prod split — prod-first ports, shared DB relocation, env badge, cutover (the double bridge instance)

**Status:** Deferred (not now)
**Priority:** Medium
**Type:** Chore
**Depends on:** [[BRDG-443]] (DB busy_timeout, VRW startup health-check, VRW prod env loading)

## Description

Run Bridge and VRW as **two separate folders / two separate processes** — a `dev` checkout and a `prod` checkout — so that **active development can never break the running production server** (a bad build, a crash, or a half-finished feature in dev must not take prod down), while keeping a **single source of truth for data** so nothing has to be maintained twice. This is the "double bridge instance" the PO deferred; pick it up after [[BRDG-443]].

Decided setup:

- **Two folders (two checkouts).** A `dev` folder (the current checkout, `dev` branch) and a separate `prod` folder (second checkout, `main` branch). Each has its own `node_modules`, its own build output, and its own running process, so a `next build` or crash in dev cannot touch prod's running process.
- **Prod-first port scheme.** Production gets the round base number, dev gets `+1`, for both apps:

  | Service | Prod | Dev | Dev folder prod-build sanity-check |
  |---------|------|-----|-----|
  | Bridge  | 3100 | 3101 | 3102 |
  | VRW     | 3110 | 3111 | — |

- **One shared database** across both folders (absolute `DB_PATH`). Single source of truth for PO metadata; background sync de-duplicates for free (the lazy-cron watermark lives in the DB); ad-hoc enrichment scripts run once. Auto-migration on boot stays (no manual migrate step). The accepted trade-off: when a destructive schema migration ships, prod briefly errors until it is promoted + restarted (see Current Behaviour for the measured frequency).
- **Environment badge.** A visible DEV / PROD / PROD-TEST badge in the UI so the PO always knows which instance they are looking at — instead of per-edit "don't touch prod data" warnings.

This spans **two repos**: Bridge (this repo, `valk-command`) and VRW (`/Users/thijsvandenberg/valk-workspace/tools/valk-remote-workspace`, a separate Gitea repo). VRW mirrors the same dev/prod folder split.

> The DB `busy_timeout`, the Bridge startup VRW health-check, and the VRW prod env-loading fix all moved to [[BRDG-443]] and should land first. This story assumes the compiled VRW prod build already loads its real config.

## Current Behaviour

**Single checkout, both servers share one DB (today)**
- Bridge dev (`tools/scripts/dev-with-memory-guard.sh`, `DEV_PORT=3100`) and prod (`tools/scripts/start-prod.sh`, `PROD_PORT=3101`) run from the **same** checkout, so both resolve `DB_PATH` (default `sqlite.db`, relative) to the **same file**. The live DB is `./sqlite.db` (~107M) in WAL mode (`-wal` + `-shm` present).
- This already-shared setup is measurably healthy: `PRAGMA quick_check` → `ok` (no corruption). WAL protects the file against multi-process access.

**Schema-change frequency (the shared-DB trade-off, measured)**
- 91 migrations from 2026-03-28 to 2026-06-30 (~1 per working day in busy months).
- ~93% are additive and harmless to a running old process: ~87 `ADD COLUMN`, ~64 `CREATE TABLE`, ~81 `CREATE INDEX` (old code simply ignores them).
- Breaking ones (old code errors until rebuilt): 1 `DROP COLUMN`, ~14 `DROP TABLE` + ~14 `RENAME` (SQLite table-rebuilds). Roughly **1 breaking migration per week**.
- Migrations run **on boot**: `migrate()` in `src/db/index.ts:33` applies pending migrations to whatever `DB_PATH` points at. So with a shared DB, starting an instance that carries a new destructive migration changes the shared schema, and any other running instance on old code errors until promoted + restarted.

**Background sync de-dup (why a shared DB is better for API load)**
- The scheduler is lazy-cron (`docs/architecture/scheduler.md`, `src/lib/scheduler.ts`): the browser POSTs `/api/scheduler/tick`; each task's `last_run` watermark is stored **in the DB** (`appSetting`, key `scheduler:<task>:last_run`).
- Shared DB → one watermark → whichever instance ticks first runs the sync; the other sees "not overdue" and skips. **Sync runs once.** Separate DBs would each keep their own watermark and sync independently (double Jira API calls).

**Environment indicator today**
- Only `NODE_ENV` is consumed (`src/app/manifest.ts:6`), branching the PWA name/colour ("Bridge" vs "Bridge (dev)"). There is no in-app environment badge and no `APP_ENV`.

**Port references that must move with the swap**
- `package.json` (`dev:plain` 3100, `start:plain` 3101), `.env.example` (`NEXT_PUBLIC_APP_URL=…:3100`, `VALK_AGENT_URL=…:3001`), `src/lib/env.ts` defaults, `CLAUDE.md`, `.claude/commands/prod-logs.md` (":3101 server"), `.claude/commands/handoff.md` ("port 3100"), `src/app/manifest.ts:4` (comment only — logic branches on `NODE_ENV`, not the port). Many `*.test.ts` files hardcode `localhost:3100`/`:3001` as arbitrary fixtures and do **not** need changing, except `src/lib/env.test.ts` (asserts the `VALK_AGENT_URL` default).

## Proposed Approach

### Part A — Two-folder local layout

- **Dev folder:** the current checkout (`~/Projects/orchestrator/valk-command`), branch `dev`. Runs Bridge dev (3101) and points at VRW dev (3111).
- **Prod folder:** a second checkout (e.g. `~/Projects/orchestrator/valk-command-prod`), branch `main`. Runs Bridge prod (3100) and points at VRW prod (3110). Update flow: promote `dev` → `main`, then in the prod folder `git pull && npm ci && npm run build && npm run start`.
- Build/code isolation comes for free: each folder has its own build output and process, so a rebuild or crash in dev never touches the prod process. This holds **regardless of the shared DB** — the DB only adds the schema dimension (Part C).
- **VRW mirrors this:** a VRW dev checkout (3111) and a VRW prod checkout (3110), so a `tsc` build / `tsx` restart in VRW dev does not disturb running VRW prod. VRW keeps **separate data dirs** per instance (its `dataDir` holds ephemeral task/session/report state, not shared PO metadata — no need to share it).

### Part B — Prod-first port scheme

**Bridge (this repo)** — swap dev/prod:
- `tools/scripts/dev-with-memory-guard.sh`: `DEV_PORT` default 3100 → **3101** (+ comment/message references).
- `tools/scripts/start-prod.sh`: `PROD_PORT` default 3101 → **3100**.
- `package.json`: `dev:plain` → 3101 (+ its `lsof -ti` kill); `start:plain` → 3100.
- `.env.example`: `NEXT_PUBLIC_APP_URL` → `http://localhost:3101`; `VALK_AGENT_URL` → `http://localhost:3110` (VRW prod).
- `src/lib/env.ts`: `VALK_AGENT_URL` default → `http://localhost:3110`; `NEXT_PUBLIC_APP_URL` default → `http://localhost:3101`.
- Docs/comments: `CLAUDE.md`, `.claude/commands/prod-logs.md`, `.claude/commands/handoff.md`, `src/app/manifest.ts` comment.

**VRW (separate repo):** `.env` `PORT` 3001 → **3111** (dev); prod binds **3110**. Recommended: keep secrets in one `.env` (with `PORT=3111` for dev) plus a one-line `.env.production` containing only `PORT=3110`, launched as `node --env-file=.env --env-file=.env.production dist/index.js` (later file wins for `PORT`, secrets inherited). Simpler alternative: `PORT=3110 node --env-file=.env dist/index.js`. **Verify Node `--env-file` precedence during implementation** and pick whichever holds. (The base "load `.env` in prod" fix already shipped in [[BRDG-443]]; this only adds the prod `PORT` override.)

**Optional dev-folder prod-build sanity-check (3102):** run a real `next start` in the dev folder on 3102 to rehearse the production build before promoting, without colliding with the real prod on 3100. It shares the same DB as everything else (no snapshot/copy step). `PROD_PORT=3102 npm run start` from the dev folder.

### Part C — Shared database relocation

- **One shared SQLite file** for both folders. Both `.env.local` set `DB_PATH` to the same **absolute** path in a neutral shared dir outside either checkout (e.g. `~/Projects/orchestrator/bridge-data/sqlite.db`), so neither folder "owns" it and git never touches it. Migrate the existing `./sqlite.db` (current data) to that location.
- **Auto-migration on boot stays** (`src/db/index.ts:33`) — no manual migrate step. Accepted trade-off: a destructive migration (~weekly) errors the other running instance until it is promoted + restarted. This is the normal "ship a schema change → restart prod" moment, not extra ceremony.
- **Non-goal:** separate/duplicate DBs, snapshot-copy refresh, expand-contract migration choreography. Explicitly rejected in favour of single-source-of-truth + free sync de-dup + single enrichment runs. (`busy_timeout` already added in [[BRDG-443]].)

### Part D — Environment badge

- Add an `APP_ENV` env var (`prod` | `dev` | `prod-test`), exposed client-side as `NEXT_PUBLIC_APP_ENV`, validated in `src/lib/env.ts`.
- Render a small, always-visible badge in the app shell (`src/app/(app)/layout.tsx` / `src/components/nav/NavPanel.tsx`): a calm marker for DEV, a clearly distinct (e.g. warm/red) marker for PROD, and a third for PROD-TEST. This is the safety mechanism that replaces per-edit warnings — you always know which instance you are in.
- Extend `src/app/manifest.ts` to key off `APP_ENV` (so the three instances stay distinguishable as PWAs) instead of only `NODE_ENV`.

## Implementation Plan

1. **Bridge port swap** (this repo): scripts, `package.json`, `.env.example`, `src/lib/env.ts` defaults, doc/comment references (Part B).
2. **Bridge DB relocation** (this repo): move the live DB to the shared absolute path; both folders' `.env.local` set the shared `DB_PATH` (Part C).
3. **Environment badge** (this repo): `APP_ENV` / `NEXT_PUBLIC_APP_ENV` in `env.ts`, badge component in the app shell, `manifest.ts` keyed off `APP_ENV` (Part D).
4. **VRW port split** (VRW repo): `.env` `PORT=3111` (dev) + prod `PORT=3110` override; commit in VRW repo.
5. **VRW prod folder** (ops): second VRW checkout for prod; dev checkout stays on 3111. Separate data dirs.
6. **Prod folder + cutover** (ops): second Bridge checkout on `main`; prod folder `.env.local` (`APP_ENV=prod`, shared `DB_PATH`, `VALK_AGENT_URL=…:3110`); dev folder `.env.local` (`APP_ENV=dev`, `VALK_AGENT_URL=…:3111`). Verify a real agent round-trip end-to-end and that a `next build` in dev leaves prod running.

## Acceptance Criteria

- [ ] Bridge prod runs on 3100, Bridge dev on 3101; VRW prod on 3110, VRW dev on 3111. <!-- start-prod.sh PROD_PORT=3100, dev-with-memory-guard.sh DEV_PORT=3101; VRW .env PORT=3111, .env.production PORT=3110 -->
- [ ] A `next build` or crash in the dev folder leaves the running prod folder server unaffected. <!-- separate checkouts: own build output + process -->
- [ ] Both folders use one shared DB via an absolute `DB_PATH`; background sync runs once across instances; ad-hoc enrichment runs once. <!-- shared DB + appSetting last_run watermark de-dup -->
- [ ] A visible DEV / PROD / PROD-TEST badge is shown in the app shell, driven by `NEXT_PUBLIC_APP_ENV`. <!-- badge in (app)/layout.tsx or NavPanel.tsx + env.ts -->
- [ ] Bridge's default `VALK_AGENT_URL` points at VRW prod (`http://localhost:3110`). <!-- src/lib/env.ts:20 + .env.example -->
- [ ] Port references in `CLAUDE.md`, `.claude/commands/prod-logs.md`, `.claude/commands/handoff.md`, and the `src/app/manifest.ts` comment match the new scheme. <!-- docs/comment sync -->

## Tests

- [ ] `src/lib/env.test.ts`: `VALK_AGENT_URL` default is `http://localhost:3110` and `NEXT_PUBLIC_APP_URL` default is `http://localhost:3101`. <!-- src/lib/env.test.ts -->
- [ ] `src/lib/env.test.ts`: `APP_ENV` parses to `prod`/`dev`/`prod-test` and rejects other values. <!-- env.ts APP_ENV schema -->
- [ ] Env-badge component test renders the correct label/treatment per `NEXT_PUBLIC_APP_ENV`. <!-- new badge component test -->
- [ ] Manual verification (ops, not unit-testable), documented in the PR: (a) a `next build` in dev does not disturb running prod; (b) sync fires once across both instances; (c) Bridge prod (3100) completes a real agent round-trip against VRW prod (3110). <!-- PR description -->

## Open Questions

- **VRW prod `PORT` strategy** — recommended default is `.env` (secrets + dev `PORT=3111`) plus a one-line `.env.production` (`PORT=3110`) via a second `--env-file`. If Node's `--env-file` precedence does not behave as expected, fall back to inline `PORT=3110` in the prod launch. Implementation detail, not a product call.
- **Shared DB location** — recommended a neutral shared dir (`~/Projects/orchestrator/bridge-data/`) outside both checkouts. If the PO prefers, the prod folder's path can be the canonical one instead. Either satisfies "one shared DB".

## Related

- [[BRDG-443]] — DB busy_timeout, VRW startup health-check, VRW prod env loading; lands first.
- [[reference_vrw_location]] — VRW lives at `/Users/thijsvandenberg/valk-workspace/tools/valk-remote-workspace`.
- `docs/architecture/scheduler.md` — lazy-cron + DB-stored `last_run` watermark (why a shared DB de-dups sync).
- `docs/architecture/workspace-integration.md` — agent proxy / SSE contract between Bridge and VRW.
- `docs/architecture/client-data-and-memory.md` — bounded SWR cache / payload split (data layer this rides on).
- `src/lib/agent-proxy.ts`, `src/lib/agent-fetch.ts` — `VALK_AGENT_URL` + `UNREACHABLE` handling.
