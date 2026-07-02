#!/usr/bin/env bash
# Idempotent VRW launcher (BRDG-459). WHY: Bridge is useless for chat/tasks
# without VRW, and "start it yourself after a reboot" kept being forgotten.
# The prod launcher (start-prod.sh) calls this to bring VRW up when its /health
# is down. It NEVER restarts a healthy VRW (a restart could kill an agent task
# mid-run) and does not supervise it afterwards: a VRW that crashes later stays
# down until the next start. Dev (`npm run dev`) keeps the warn-only probe in
# check-vrw.sh. This revises BRDG-443's "Bridge never starts VRW" rule for the
# prod path only.
#
# VRW runs detached (nohup, stdin closed) so it survives Bridge stopping, with
# output captured to logs/vrw-<stamp>.log in this repo, pruned like the prod
# logs, so VRW can be debugged from a session in this repo.
#
# Tunables (env): VRW_PORT, VRW_PATH, VRW_LOG_DIR, VRW_LOG_KEEP, VRW_LOG_MAX_AGE_DAYS.
set -uo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
VRW_PATH=${VRW_PATH:-"/Users/thijsvandenberg/valk-workspace/tools/valk-remote-workspace"}
PORT=${VRW_PORT:-3110}
LOG_DIR=${VRW_LOG_DIR:-"$ROOT/logs"}
KEEP=${VRW_LOG_KEEP:-15}
MAX_AGE_DAYS=${VRW_LOG_MAX_AGE_DAYS:-14}

# Same anchored-grep env reading as check-vrw.sh: sourcing runs arbitrary
# content and chokes on values with special chars.
read_env_var() { # $1=varname $2=file
  grep -E "^[[:space:]]*$1=" "$2" 2>/dev/null | tail -n1 | cut -d= -f2- | tr -d '"'\'''
}

VALK_AGENT_URL=""
[ -f "$ROOT/.env.local" ] && VALK_AGENT_URL=$(read_env_var VALK_AGENT_URL "$ROOT/.env.local")
[ -z "$VALK_AGENT_URL" ] && [ -f "$ROOT/.env" ] && VALK_AGENT_URL=$(read_env_var VALK_AGENT_URL "$ROOT/.env")
[ -z "$VALK_AGENT_URL" ] && VALK_AGENT_URL="http://localhost:$PORT"

if curl -fsS -m 3 "$VALK_AGENT_URL/health" >/dev/null 2>&1; then
  echo "[start-vrw] VRW already running at $VALK_AGENT_URL - leaving it untouched"
  exit 0
fi

# A non-local VALK_AGENT_URL means Bridge talks to a remote VRW; a locally
# started instance would never be reached, so fall back to warn-only.
case "$VALK_AGENT_URL" in
  http://localhost:* | http://127.0.0.1:*) ;;
  *)
    echo "[start-vrw] WARNING: VRW not reachable at $VALK_AGENT_URL/health (remote URL, not starting a local VRW)"
    exit 1
    ;;
esac

mkdir -p "$LOG_DIR"

# Prune before starting, same policy as prod logs: age first, then cap count.
find "$LOG_DIR" -name 'vrw-*.log' -type f -mtime +"$MAX_AGE_DAYS" -delete 2>/dev/null
ls -1t "$LOG_DIR"/vrw-*.log 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
  rm -f "$old"
done

STAMP=$(date '+%Y%m%d-%H%M%S')
LOG_FILE="$LOG_DIR/vrw-$STAMP.log"

# Health failed but something may still hold the port (wedged half-dead VRW).
lsof -ti:"$PORT" | xargs kill -9 2>/dev/null

# Header via > so the printed log path exists even if npm dies instantly; npm
# appends so it cannot truncate the header. stdin closed + nohup so the
# detached VRW survives Bridge (and the terminal) stopping. `npm --prefix`
# sets cwd to the VRW repo, so its `--env-file=.env` resolves correctly.
#
# setsid (via perl, macOS ships no setsid binary): npm installs its own SIGINT
# handler, so a plain `nohup ... &` child still dies when Ctrl+C hits the
# terminal's foreground process group (verified: SIGINT to the group killed
# VRW). A new session puts VRW outside that group entirely.
echo "[start-vrw] $(date '+%Y-%m-%d %H:%M:%S') starting VRW via npm --prefix $VRW_PATH start" >"$LOG_FILE"
nohup perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV or die "exec failed: $!"' -- \
  npm --prefix "$VRW_PATH" start >>"$LOG_FILE" 2>&1 </dev/null &

# -m 1 inside the loop: a longer curl timeout stacks on the sleep and would
# stretch 15 attempts to minutes against a dead-but-open port.
for _ in $(seq 1 15); do
  if curl -fsS -m 1 "$VALK_AGENT_URL/health" >/dev/null 2>&1; then
    echo "[start-vrw] VRW up at $VALK_AGENT_URL - logging to $LOG_FILE (keeping last $KEEP, max ${MAX_AGE_DAYS}d)"
    exit 0
  fi
  sleep 1
done

echo "[start-vrw] WARNING: VRW did not become healthy within 15s - see $LOG_FILE"
echo "[start-vrw] (stale or missing dist/? build it with: npm run vrw:build)"
exit 1
