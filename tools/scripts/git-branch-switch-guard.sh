#!/usr/bin/env bash
# PreToolUse(Bash) guard: require explicit approval before any git branch switch.
# Emits an "ask" permission decision for branch switches; stays silent (normal
# permission flow) for everything else, including file/path checkouts and
# conflict resolution (git checkout -- <path>, --ours/--theirs). Reads the
# tool-call JSON on stdin.
c=$(jq -r '.tool_input.command // ""' 2>/dev/null)

ask=0
# git switch <anything> is always a branch operation.
if printf '%s' "$c" | grep -Eq 'git[[:space:]]+switch([[:space:]]|$)'; then ask=1; fi
# git checkout -b / -B creates and switches to a branch.
if printf '%s' "$c" | grep -Eq 'git[[:space:]]+checkout[[:space:]]+-[bB]([[:space:]]|$)'; then ask=1; fi
# git checkout <branch/ref> with no "--" path separator is a branch switch;
# anything containing "--" is treated as a path/conflict checkout and allowed.
if printf '%s' "$c" | grep -Eq 'git[[:space:]]+checkout([[:space:]]|$)'; then
  case "$c" in
    *--*) : ;;
    *) ask=1 ;;
  esac
fi

if [ "$ask" -eq 1 ]; then
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Git branch switch detected. Policy: never switch branches without explicit approval."}}'
fi
exit 0
