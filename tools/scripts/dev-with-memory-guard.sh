#!/usr/bin/env bash
# Runs `next dev` (Turbopack) on :3100 and restarts it whenever the server
# process crosses a memory ceiling. WHY: Turbopack leaks memory over long dev
# sessions and can balloon to many GB, starving a 16GB machine. A graceful
# auto-restart keeps the footprint bounded without manual babysitting.
#
# Memory is read via `footprint` (phys_footprint), not `ps -o rss`: under
# memory pressure macOS compresses pages, so rss massively under-reports while
# phys_footprint matches what Activity Monitor shows.
#
# Tunables (env): DEV_PORT, DEV_MEM_LIMIT_MB, DEV_MEM_INTERVAL, DEV_FLAP_WINDOW,
# DEV_GUARD_LOG.
set -uo pipefail

PORT=${DEV_PORT:-3100}
THRESHOLD_MB=${DEV_MEM_LIMIT_MB:-4096}
CHECK_INTERVAL=${DEV_MEM_INTERVAL:-30}
# If a server crosses the limit within this many seconds of starting, restarting
# won't help (something is structurally wrong) — abort the loop instead of
# flapping. WHY: a too-tight limit or a runaway boot would otherwise spin in a
# kill/restart loop that never serves a usable dev server.
FLAP_WINDOW=${DEV_FLAP_WINDOW:-60}
GUARD_LOG=${DEV_GUARD_LOG:-"$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/tools/scripts/dev-guard-restarts.log"}

log_event() {
  printf '%s\t%s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >>"$GUARD_LOG"
}

# The PID(s) bound to the port as a LISTEN socket — i.e. the actual dev server.
# WHY: a plain `lsof -ti:PORT` also returns processes that merely have a
# *connection* to the port (e.g. a browser tab open on localhost:3100). Picking
# one of those by `head -1` made the guard measure a 66MB browser helper instead
# of the 7GB server, so it never restarted. Restricting to LISTEN owners targets
# the server itself and frees the port without SIGKILLing connected browser tabs.
port_listeners() { lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null; }

phys_mb() {
  local pid=$1 line val unit
  line=$(/usr/bin/footprint -p "$pid" 2>/dev/null | grep -m1 'phys_footprint:')
  [[ -z "$line" ]] && { echo 0; return; }
  val=$(echo "$line" | sed -E 's/.*phys_footprint:[[:space:]]*([0-9.]+)[[:space:]]*([KMG]?B).*/\1/')
  unit=$(echo "$line" | sed -E 's/.*phys_footprint:[[:space:]]*([0-9.]+)[[:space:]]*([KMG]?B).*/\2/')
  case "$unit" in
    GB) awk "BEGIN{printf \"%d\", $val*1024}" ;;
    MB) awk "BEGIN{printf \"%d\", $val}" ;;
    KB|B) awk "BEGIN{printf \"%d\", $val/1024}" ;;
    *) echo 0 ;;
  esac
}

# Singleton takeover: if another guard is already running, kill it and take
# over. WHY: starting a fresh dev should replace a stale guard, not bail out.
# Two live guards on the same port stomp on each other — each loop iteration
# starts by killing whatever holds the port, so guard B kills guard A's server
# (and vice versa) every CHECK_INTERVAL, an endless ping-pong. Match only the
# bash invocation, not the npm/sh wrapper that launched us.
guards() { pgrep -f "bash.*dev-with-memory-guard\.sh" 2>/dev/null | grep -v "^$$\$" || true; }
others=$(guards)
if [[ -n "$others" ]]; then
  echo "[dev-guard] another guard is running (PID $(echo "$others" | tr '\n' ' ')) — killing it and taking over."
  log_event "takeover: killing existing guard (PID $(echo "$others" | tr '\n' ' '))"
  # TERM first so the old guard runs its cleanup trap (frees the port), then
  # wait for it to actually exit. WHY: if its cleanup ran after we started our
  # own `next dev`, it would kill our fresh server. Hard-kill any that ignore it.
  echo "$others" | xargs kill 2>/dev/null
  for _ in $(seq 1 50); do
    [[ -z "$(guards)" ]] && break
    sleep 0.1
  done
  stragglers=$(guards)
  [[ -n "$stragglers" ]] && echo "$stragglers" | xargs kill -9 2>/dev/null
fi

DEV_PID=""
cleanup() {
  echo ""
  echo "[dev-guard] stopping"
  [[ -n "$DEV_PID" ]] && kill "$DEV_PID" 2>/dev/null
  port_listeners | xargs kill -9 2>/dev/null
  exit 0
}
trap cleanup INT TERM

echo "[dev-guard] watching :$PORT — restart above ${THRESHOLD_MB}MB, checking every ${CHECK_INTERVAL}s (flap-stop under ${FLAP_WINDOW}s)"
log_event "guard started (limit=${THRESHOLD_MB}MB interval=${CHECK_INTERVAL}s flap-window=${FLAP_WINDOW}s)"

# Probe VRW once at startup; warn-and-continue so Bridge boots even if it is down.
bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/check-vrw.sh" || true

while true; do
  port_listeners | xargs kill -9 2>/dev/null
  next dev --turbopack --port "$PORT" &
  DEV_PID=$!
  start_ts=$SECONDS
  hit_mb=0

  while kill -0 "$DEV_PID" 2>/dev/null; do
    sleep "$CHECK_INTERVAL"
    srv_pid=$(port_listeners | head -1)
    [[ -z "$srv_pid" ]] && continue
    mb=$(phys_mb "$srv_pid")
    if (( mb > THRESHOLD_MB )); then
      hit_mb=$mb
      echo "[dev-guard] next-server at ${mb}MB > ${THRESHOLD_MB}MB — restarting"
      break
    fi
  done

  uptime_s=$(( SECONDS - start_ts ))
  kill "$DEV_PID" 2>/dev/null
  port_listeners | xargs kill -9 2>/dev/null

  if (( hit_mb > 0 )); then
    log_event "restart: hit ${hit_mb}MB > ${THRESHOLD_MB}MB after ${uptime_s}s uptime"
    if (( uptime_s < FLAP_WINDOW )); then
      echo "[dev-guard] crossed limit after only ${uptime_s}s (< ${FLAP_WINDOW}s) — NOT restarting. Raise DEV_MEM_LIMIT_MB or investigate. See $GUARD_LOG"
      log_event "ABORT: flapping — crossed limit after ${uptime_s}s (< ${FLAP_WINDOW}s), guard stopped"
      exit 1
    fi
  else
    log_event "dev server exited on its own after ${uptime_s}s — restarting"
  fi
done
