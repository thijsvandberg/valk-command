#!/usr/bin/env bash
# Boot-time reachability probe for VRW (the valk-remote-workspace agent). WHY:
# Bridge is useless for chat/tasks if VRW is down, but it must still boot so the
# rest of the app (board, settings) works. So this warns and returns non-zero;
# the dev launcher calls it with `|| true` and starts Bridge regardless. This
# probe never starts VRW itself; the prod launcher uses start-vrw.sh instead,
# which auto-starts a downed VRW (BRDG-459).
#
# Reads VALK_AGENT_URL from .env.local (fallback .env, fallback localhost:3110)
# and probes "<url>/health", which VRW exempts from auth so no API key is needed.
set -uo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)

# Grep the first uncommented assignment rather than sourcing the file: sourcing
# runs arbitrary content and chokes on values with special chars. The
# `^[[:space:]]*VALK_AGENT_URL=` anchor skips the commented production line, and
# `tail -n1` lets a later uncommented value win over an earlier one.
read_env_var() { # $1=varname $2=file
  grep -E "^[[:space:]]*$1=" "$2" 2>/dev/null | tail -n1 | cut -d= -f2- | tr -d '"'\'''
}

VALK_AGENT_URL=""
[ -f "$ROOT/.env.local" ] && VALK_AGENT_URL=$(read_env_var VALK_AGENT_URL "$ROOT/.env.local")
[ -z "$VALK_AGENT_URL" ] && [ -f "$ROOT/.env" ] && VALK_AGENT_URL=$(read_env_var VALK_AGENT_URL "$ROOT/.env")
[ -z "$VALK_AGENT_URL" ] && VALK_AGENT_URL="http://localhost:3110"

if curl -fsS -m 3 "$VALK_AGENT_URL/health" >/dev/null 2>&1; then
  echo "[check-vrw] VRW reachable at $VALK_AGENT_URL"
  exit 0
fi

echo "[check-vrw] WARNING: VRW not reachable at $VALK_AGENT_URL/health"
echo "[check-vrw] Chat and workspace tasks will not work until VRW is up. Start it with:"
echo "[check-vrw]   npm run vrw:start"
echo "[check-vrw] Bridge will boot anyway."
exit 1
