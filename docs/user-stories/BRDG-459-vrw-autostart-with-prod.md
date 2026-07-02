# BRDG-459: Auto-start VRW with the prod server, with persisted VRW logs

**Status:** To Do
**Priority:** Medium
**Type:** Chore

## Description

When the PO starts the Bridge prod server (`npm run start`), VRW should come up automatically instead of only printing a "start it yourself" warning. Today a reboot silently leaves VRW down: Bridge boots fine, but chat and workspace tasks fail with `[agent-fetch] UNREACHABLE` until the PO remembers to start VRW manually (this happened on 2026-07-02).

The PO explicitly chose the **simple variant**: a shell script owned by this repo, invoked via an npm script, called from the prod launcher. The **launchd/supervised variant was considered and rejected for now** (more setup, solves crash-recovery which is not the pain point; the pain point is "forgotten after reboot").

Additionally, VRW currently logs only to the terminal it was started in, so when it is started detached its output would be lost. VRW output must be captured to persistent, pruned log files, and Bridge's docs must record where they live so the PO can ask Claude to debug them from a session in this repo.

This story deliberately **revises the BRDG-443 decision** ("Bridge never auto-starts VRW") for the prod path. Dev (`npm run dev`) keeps the warn-only health check.

## Current Behaviour

- `npm run start` runs `tools/scripts/start-prod.sh`: prunes and creates `logs/prod-<stamp>.log`, frees port 3100, then calls `tools/scripts/check-vrw.sh || true` and boots `next start` regardless of the outcome.
- `tools/scripts/check-vrw.sh` reads `VALK_AGENT_URL` from `.env.local`/`.env` (fallback `http://localhost:3110`), probes `<url>/health`, and on failure prints a manual-start instruction. Its header comment states the BRDG-443 decision verbatim: "It never starts, restarts, or supervises VRW — that is the user's job."
- VRW (separate repo at `/Users/thijsvandenberg/valk-workspace/tools/valk-remote-workspace`) starts via its own `npm start`: `PORT=3110 BASE_URL=http://localhost:3110 node --env-file=.env dist/index.js`. It runs in the foreground and writes no log files; the VRW repo has no `logs/` directory.
- Bridge's `package.json` already proxies to the VRW repo with `npm --prefix`: `vrw:dev`, `vrw:build`, `vrw:prod`. There is no script that just starts the compiled VRW prod build without rebuilding.
- Bridge's `logs/` directory is gitignored (`.gitignore` line 19) and already holds the pruned `prod-*.log` files.

## Proposed Approach

1. **New `tools/scripts/start-vrw.sh` (this repo).** Idempotent launcher:
   - Probe `<VALK_AGENT_URL>/health` (reuse the env-reading approach from `check-vrw.sh`). If VRW already responds, print "already running" and exit 0 — never restart a healthy VRW.
   - Otherwise free port 3110 (same `lsof | xargs kill -9` pattern `start-prod.sh` uses for 3100, to clear a wedged half-dead process), then start VRW **detached** (`nohup npm --prefix <vrw path> start`) with stdout/stderr redirected to `logs/vrw-<stamp>.log` in **Bridge's** `logs/` directory.
   - Prune `vrw-*.log` with the same policy as prod logs: keep last 15 files, drop older than 14 days (tunables `VRW_LOG_KEEP`, `VRW_LOG_MAX_AGE_DAYS`, mirroring `PROD_LOG_*`).
   - Poll `/health` for up to ~15s; print the log file path and success, or a warning with the log path on failure. Exit non-zero on failure but never block the caller.
2. **Wire into the prod launcher.** In `start-prod.sh`, replace `check-vrw.sh || true` with `start-vrw.sh || true`. Bridge still boots even if VRW fails to start (same warn-and-continue philosophy as BRDG-443, just with an attempted start first).
3. **npm script.** Add `"vrw:start": "bash tools/scripts/start-vrw.sh"` to Bridge's `package.json` so the PO can (re)start VRW standalone. Update the failure message in `check-vrw.sh` (still used by `npm run dev`) to recommend `npm run vrw:start` instead of the manual `cd ... && npm run start`.
4. **Docs.** Update `CLAUDE.md` (Local Server section) and `docs/architecture/workspace-integration.md` with: VRW auto-starts with prod, log location `logs/vrw-*.log`, standalone start via `npm run vrw:start`. Rewrite the header comments of `check-vrw.sh`/`start-prod.sh` where they state the old "never starts VRW" rule, referencing this story.

**Non-goals / out of scope:**
- No supervision or auto-restart when VRW crashes later (that is the rejected launchd variant; revisit if crash-recovery becomes a real pain).
- `npm run dev` keeps the warn-only check; auto-start is prod-only per the PO's request.
- VRW deliberately survives a Bridge stop (detached process): stopping or restarting Bridge must not kill the agent mid-task.
- No changes in the VRW repo itself; logging is handled by output redirection from the launcher.

## Open Questions

- **Should `tools/scripts/prod-log-digest.py` also digest `logs/vrw-*.log`?** Recommended default: no, out of scope. VRW's log format differs from Bridge's structured logger, and the PO can point Claude at the raw file directly. If VRW debugging becomes frequent, a follow-up story can add a `--vrw` mode to the digest.

## Implementation Plan

1. **`tools/scripts/start-vrw.sh`** (new, executable, `set -uo pipefail` without `-e` like siblings):
   - Copy `ROOT` resolution, `read_env_var` helper, and the `VALK_AGENT_URL` fallback chain from `check-vrw.sh` (duplicating the ~10-line helper is simpler than sourcing a script that `exit`s).
   - Health probe first (`curl -fsS -m 3`): healthy → "already running", exit 0, before any port kill.
   - Guard: if `VALK_AGENT_URL` is not localhost/127.0.0.1, warn-only and exit 1 (starting a local VRW that Bridge never talks to would be wrong).
   - Prune `vrw-*.log` (copy prune block from `start-prod.sh`, `VRW_LOG_KEEP=15` / `VRW_LOG_MAX_AGE_DAYS=14` tunables), free port 3110 (wedged half-dead VRW), then write a header line with `>` (file exists even if npm dies instantly) and `nohup npm --prefix "$VRW_PATH" start >>"$LOG_FILE" 2>&1 </dev/null &` (append so the header is not truncated; stdin closed so node never holds the tty; `npm --prefix` sets cwd so VRW's `--env-file=.env` resolves).
   - Poll `/health` 15x with `curl -m 1` + `sleep 1` (`-m 3` would balloon the budget against a dead-but-open port); success prints the log path, failure warns with the log path + a `npm run vrw:build` hint and exits 1.
2. **Wiring** — `start-prod.sh` replaces `check-vrw.sh || true` with `start-vrw.sh || true`; `package.json` gains `"vrw:start": "bash tools/scripts/start-vrw.sh"` next to the other `vrw:*` scripts; `check-vrw.sh` failure message recommends `npm run vrw:start` (its unused `VRW_PATH` var goes), header comments updated to reference this story.
3. **Docs** — `CLAUDE.md` Stack ports bullet (there is no "Local Server" section; the prod-server sentence lives there) + new "Local VRW lifecycle" subsection in `docs/architecture/workspace-integration.md` (additive; the doc's Health Check section describes the runtime route, not boot).
4. **Manual verification** (no vitest for shell scripts, BRDG-443 precedent): down→starts+log created; healthy→untouched (same pid); forced failure (`VRW_PATH=/nonexistent`)→warning, non-fatal; SIGINT to the process group→VRW survives (POSIX: `&` children of non-interactive shells ignore SIGINT; verify empirically); >15 dummy logs→pruned; dev warning text.

## Acceptance Criteria

- [x] `npm run start` with VRW down starts VRW automatically; `/health` returns `status: ok` before or shortly after Bridge is up. <!-- start-prod.sh calling tools/scripts/start-vrw.sh; script verified live for both branches, start-prod wiring verified by inspection (a full start-prod rerun would have killed the PO's live prod server) -->
- [x] `npm run start` with VRW already healthy leaves it untouched (no restart, no port kill). <!-- start-vrw.sh early-exit on successful health probe; verified: same pid before/after -->
- [x] VRW output is persisted to `logs/vrw-<stamp>.log`, pruned to last 15 files / 14 days. <!-- start-vrw.sh, mirrors start-prod.sh prune block; verified: real boot log captured, 20 dummies pruned to 15 -->
- [x] A VRW start failure is non-fatal: a clear warning with the log file path is printed and Bridge boots anyway. <!-- start-vrw.sh failure path + `|| true` in start-prod.sh; verified with VRW_PATH=/nonexistent -->
- [x] `npm run vrw:start` starts (or reports already-running) VRW standalone. <!-- package.json vrw:start; verified -->
- [x] Stopping the Bridge prod process does not stop VRW. <!-- nohup + setsid (perl POSIX::setsid) in start-vrw.sh; plain nohup was NOT enough: npm installs its own SIGINT handler, so group-wide Ctrl+C killed VRW. Verified: after setsid, SIGINT to the launcher's process group leaves VRW running (own session, no controlling tty) -->
- [x] `npm run dev` behaviour unchanged: warn-only, but the warning now recommends `npm run vrw:start`. <!-- check-vrw.sh message; dev-with-memory-guard.sh untouched; verified with VRW down -->
- [x] `CLAUDE.md` and `docs/architecture/workspace-integration.md` document the auto-start and the VRW log location. <!-- CLAUDE.md Stack ports bullet + workspace-integration.md "Local VRW Lifecycle" section -->

## Tests

Shell-script behaviour is not covered by the vitest suite (precedent: BRDG-443 verified `check-vrw.sh` manually and documented it in the PR). Manual verification, performed live on 2026-07-02:

- [x] VRW down + start script: VRW comes up, `/health` ok, log file created. <!-- verified via start-vrw.sh directly; full start-prod rerun skipped to not kill the live prod server -->
- [x] VRW up + start script: VRW untouched (same pid before/after). <!-- verified: pid 38787 unchanged, "already running" message -->
- [x] VRW start forced to fail (`VRW_PATH=/nonexistent`): warning with log path printed, exit 1, npm ENOENT captured in the log. <!-- verified in /tmp/vrw-prune-test-459 -->
- [x] SIGINT to the launching process group: VRW survives (stronger than "kill Bridge": simulates terminal Ctrl+C reaching the whole group). <!-- verified after the setsid fix; plain nohup failed this test -->
- [x] 20 dummy `logs/vrw-*.log` files: pruned to newest 15 before the new log is created. <!-- verified with VRW_LOG_DIR pointed at a temp dir -->

## Deviations

- `setsid` re-parenting (via `perl -MPOSIX`, macOS ships no setsid binary) was added on top of the planned `nohup`: empirically, SIGINT delivered to the process group killed the nohup'd VRW because npm installs its own SIGINT handler. This was flagged as a pitfall in the plan and the fallback was applied after the first test failed.
- A guard was added for non-localhost `VALK_AGENT_URL`: the script then warns instead of starting a local VRW that Bridge would never talk to (recommended default from planning, no PO input needed).

## Related

- [[BRDG-443-db-hardening-vrw-healthcheck-prod-env]] — introduced `check-vrw.sh` and the "Bridge never auto-starts VRW" rule this story revises for prod; also made VRW prod load its real `.env`.
- [[BRDG-447-two-folder-dev-prod-split]] — when the two-folder split lands, `start-vrw.sh` must target the VRW **prod** checkout (3110); the script should keep the VRW path in one variable to make that a one-line change.
- `tools/scripts/start-prod.sh` — the log-capture + pruning pattern this story copies for VRW.
