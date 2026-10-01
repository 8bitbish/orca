#!/usr/bin/env bash
# Close this Orca automation run's terminal (and its Claude session) once the session's turn has
# ended and Orca has saved the run's report, so finished runs don't leave an idle session open.
# Returns at once; the wait runs detached. Does nothing unless this Claude session is the one an
# automation run launched.
set -euo pipefail

turn_wait_ms=300000
give_up_seconds=3600
# How long Orca may take to save the report after the turn ends.
report_wait_seconds=60
log_dir="$HOME/Library/Logs/orca-personal-sync"
self="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"

orca_bin=$(command -v orca || true)
[ -n "$orca_bin" ] || orca_bin=/Applications/Orca.app/Contents/Resources/bin/orca

stamp() { date '+%F %T'; }

# Prints the JSON record of run $1, or nothing if Orca no longer lists it.
read_run() {
  "$orca_bin" automations runs --json 2>/dev/null |
    jq -c --arg id "$1" 'first(.result.runs[] | select(.id == $id)) // empty' 2>/dev/null || true
}

# Prints the handle of the terminal showing pane $1, or nothing if it is gone.
pane_handle() {
  "$orca_bin" terminal list --json 2>/dev/null |
    jq -r --arg pane "$1" \
      'first(.result.terminals[] | select((.tabId + ":" + .leafId) == $pane) | .handle) // empty' \
      2>/dev/null || true
}

if [ "${1:-}" = --wait ]; then
  run_id=$2 pane_key=$3
  started_ms=$(($(date +%s) * 1000))
  echo "$(stamp) waiting for the turn to end (run $run_id, pane $pane_key)"
  deadline=$((SECONDS + give_up_seconds))
  while [ "$SECONDS" -lt "$deadline" ]; do
    # Why: resolve the handle from the run's own pane, not inherited env, so a handle reissued
    # after an Orca restart can never point the close at another terminal.
    handle=$(pane_handle "$pane_key")
    if [ -z "$handle" ]; then
      echo "$(stamp) the run's terminal is already gone"
      exit 0
    fi
    idle=$("$orca_bin" terminal wait --terminal "$handle" --for tui-idle \
      --timeout-ms "$turn_wait_ms" --json 2>/dev/null | jq -r '.result.wait.satisfied // false') ||
      idle=false
    [ "$idle" = true ] || { sleep 5; continue; }
    # Why: Orca's run status can read `completed` before the agent finishes, so the proof the
    # report is saved is a snapshot captured after this waiter started.
    for _ in $(seq 1 $((report_wait_seconds / 5))); do
      sleep 5
      run=$(read_run "$run_id")
      [ -n "$run" ] || run='{}'
      status=$(jq -r '.status // "gone"' <<<"$run")
      captured=$(jq -r '.outputSnapshot.capturedAt // 0' <<<"$run")
      case "$status" in
        pending | dispatching | dispatched) continue ;;
        completed) [ "$captured" -ge "$started_ms" ] || continue ;;
        *)
          # A failed or blocked run stays open for Jake to look at.
          echo "$(stamp) run is '$status', leaving its terminal open"
          exit 0
          ;;
      esac
      handle=$(pane_handle "$pane_key")
      [ -n "$handle" ] || { echo "$(stamp) the run's terminal is already gone"; exit 0; }
      echo "$(stamp) report saved; closing $handle"
      "$orca_bin" terminal close --terminal "$handle" --json
      exit 0
    done
    echo "$(stamp) turn ended but no new report was saved; waiting again"
  done
  echo "$(stamp) gave up after ${give_up_seconds}s; leaving the terminal open"
  exit 0
fi

if [ -z "${ORCA_TERMINAL_HANDLE:-}" ] || [ -z "${ORCA_PANE_KEY:-}" ] || [ -z "${CLAUDE_PID:-}" ]; then
  echo "Not a Claude session in an Orca terminal; nothing to close."
  exit 0
fi
run=$("$orca_bin" automations runs --json |
  jq -c --arg pane "$ORCA_PANE_KEY" \
    'first(.result.runs[] | select(.terminalPaneKey == $pane
      and (.status | IN("pending", "dispatching", "dispatched", "completed")))) // empty')
claude_start=$(LC_ALL=C ps -o lstart= -p "$CLAUDE_PID" 2>/dev/null | sed 's/ *$//' || true)
claude_start_ms=0
[ -z "$claude_start" ] ||
  claude_start_ms=$(($(LC_ALL=C date -j -f '%a %b %e %T %Y' "$claude_start" +%s) * 1000))
# Why: only the Claude process the run itself launched may close the run's terminal. A session
# started by hand, even in a finished run's terminal, starts later and is left alone.
if [ -z "$run" ] || ! jq -e --argjson at "$claude_start_ms" \
  '$at >= .startedAt - 60000 and $at <= (.dispatchedAt // .startedAt) + 300000' \
  <<<"$run" >/dev/null; then
  echo "This session was not started by an Orca automation run; nothing to close."
  exit 0
fi
run_id=$(jq -r .id <<<"$run")

mkdir -p "$log_dir"
log="$log_dir/close-session-$(date +%Y-%m-%d_%H%M%S).log"
# Why: double fork + setsid puts the waiter in its own session, outside the agent's process
# group, so the agent tearing down its shell command doesn't take the waiter with it.
perl -MPOSIX -e 'fork and exit; POSIX::setsid(); fork and exit; exec @ARGV' \
  bash "$self" --wait "$run_id" "$ORCA_PANE_KEY" </dev/null >>"$log" 2>&1
echo "Run $run_id: this terminal will close after this turn, once Orca saves the report (log: $log)."
