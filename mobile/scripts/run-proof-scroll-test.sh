#!/usr/bin/env bash
# Records a scroll test of the Android chat over a long transcript full of proof, project and
# Slack cards, served by the mock host (MOCK_CHAT_SCENARIO=proof-scroll). Repeatable per APK.
#
#   mobile/scripts/run-proof-scroll-test.sh <apk> <output.mp4>
#
# Env: SERIAL (emulator-5556), AVD (Medium_Phone_API_36.0), PORT (6790; 6768 is the desktop's),
#      GPU (host; headless otherwise defaults to software rendering at a few frames per second).
# Boots the AVD headless and starts the mock host when they are not already running, and leaves
# both running. Writes <output>.timeline.txt (action times, ~1 s behind video time).
set -euo pipefail

APK=${1:?usage: run-proof-scroll-test.sh <apk> <output.mp4>}
OUT=${2:?usage: run-proof-scroll-test.sh <apk> <output.mp4>}
SERIAL=${SERIAL:-emulator-5556}
AVD=${AVD:-Medium_Phone_API_36.0}
PORT=${PORT:-6790}
GPU=${GPU:-host}
PKG=com.stably.orca.mobile.personal
SDK=${ANDROID_HOME:-$HOME/Library/Android/sdk}
ADB="$SDK/platform-tools/adb"
MOBILE_DIR=$(cd "$(dirname "$0")/.." && pwd)
STATE_DIR=${STATE_DIR:-${TMPDIR:-/tmp}/orca-proof-scroll}
mkdir -p "$STATE_DIR" "$(dirname "$OUT")"
OUT=$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")

adb_s() { "$ADB" -s "$SERIAL" "$@"; }
log() { printf '[proof-scroll] %s\n' "$*"; }

# Centre of the first node whose text or content-desc equals (or, with a trailing *, starts with) $1.
find_node() {
  adb_s shell uiautomator dump /sdcard/proof-scroll-ui.xml >/dev/null 2>&1 || true
  adb_s exec-out cat /sdcard/proof-scroll-ui.xml >"$STATE_DIR/ui.xml" 2>/dev/null || true
  python3 - "$1" "$STATE_DIR/ui.xml" <<'PY'
import html, re, sys
want, xml = sys.argv[1], open(sys.argv[2], encoding="utf-8", errors="replace").read()
prefix = want.endswith("*")
want = want.rstrip("*")
for node in re.findall(r"<node [^>]*>", xml):
    for attr in ("text", "content-desc"):
        m = re.search(r'\b%s="([^"]*)"' % attr, node)
        value = html.unescape(m.group(1)) if m else ""
        if value == want or (prefix and value.startswith(want)):
            x1, y1, x2, y2 = map(int, re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', node).groups())
            print((x1 + x2) // 2, (y1 + y2) // 2)
            sys.exit(0)
sys.exit(1)
PY
}

# Taps $1 once it appears; returns 1 after $2 seconds (default 30) without it.
tap_when_shown() {
  local deadline=$((SECONDS + ${2:-30})) point
  while ((SECONDS < deadline)); do
    if point=$(find_node "$1"); then
      adb_s shell input tap $point
      log "tapped '$1' at $point"
      return 0
    fi
    sleep 1
  done
  return 1
}

# --- emulator -------------------------------------------------------------------------------
if ! "$ADB" devices | grep -q "^$SERIAL[[:space:]]*device"; then
  log "booting $AVD headless on $SERIAL"
  nohup "$SDK/emulator/emulator" -avd "$AVD" -no-window -no-audio -no-boot-anim -gpu "$GPU" \
    -port "${SERIAL#emulator-}" >"$STATE_DIR/emulator.log" 2>&1 &
  "$ADB" -s "$SERIAL" wait-for-device
fi
until [[ "$(adb_s shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == 1 ]]; do sleep 2; done
adb_s shell settings put global window_animation_scale 1 >/dev/null
log "$SERIAL booted"

# --- mock host ------------------------------------------------------------------------------
if ! lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  log "starting mock host on port $PORT"
  (cd "$MOBILE_DIR" && PORT=$PORT MOCK_CHAT_SCENARIO=proof-scroll \
    MOCK_SERVER_KEY_FILE="$STATE_DIR/mock-key.json" \
    nohup npx tsx scripts/mock-server.ts >"$STATE_DIR/mock.log" 2>&1 &)
  for _ in $(seq 1 30); do
    grep -q 'public key (base64)' "$STATE_DIR/mock.log" 2>/dev/null && break
    sleep 1
  done
fi
KEY=$(grep -o 'public key (base64): .*' "$STATE_DIR/mock.log" | tail -1 | sed 's/.*: //')
[[ -n "$KEY" ]] || { log "no mock host key in $STATE_DIR/mock.log (was it started by this script?)"; exit 1; }
# The emulator reaches the Mac's loopback at 10.0.2.2.
CODE=$(node -e 'process.stdout.write(Buffer.from(JSON.stringify({v:2,endpoint:process.argv[1],deviceToken:"mock-device-token",publicKeyB64:process.argv[2]})).toString("base64url"))' \
  "ws://10.0.2.2:$PORT" "$KEY")

# --- install and pair -----------------------------------------------------------------------
log "installing $APK"
adb_s install -r "$APK" >/dev/null
adb_s shell pm clear "$PKG" >/dev/null
adb_s shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
# A link sent before the app has mounted is dropped, so wait for its first screen and retry.
for _ in $(seq 1 60); do find_node 'Pair Desktop' >/dev/null && break; sleep 1; done
paired=0
for _ in 1 2 3; do
  adb_s shell am start -a android.intent.action.VIEW -d "orca://pair?code=$CODE" "$PKG" >/dev/null 2>&1
  if tap_when_shown Pair 15; then paired=1; break; fi
done
((paired)) || { log "pair prompt never appeared"; exit 1; }
tap_when_shown 'Use Chat UI' 20 || log "no chat-UI onboarding step"
tap_when_shown 'Not now' 20 || log "no notifications onboarding step"
point=$(
  for _ in $(seq 1 30); do find_node 'manta-1*' && break; sleep 1; done
) || { log "workspace list never showed manta-1"; exit 1; }

# --- record ---------------------------------------------------------------------------------
TIMELINE="$OUT.timeline.txt"
: >"$TIMELINE"
adb_s shell rm -f /sdcard/proof-scroll.mp4
adb_s shell screenrecord --time-limit 60 --bit-rate 8000000 /sdcard/proof-scroll.mp4 &
REC=$!
sleep 1
START=$(python3 -c 'import time; print(time.time())')
mark() { python3 -c "import time; print(f'{time.time()-$START:6.1f}s  $1')" | tee -a "$TIMELINE"; }

mark "open chat (tap manta-1)"
adb_s shell input tap $point
# uiautomator never sees an idle screen while proof video plays, so readiness is read from the
# host instead: the chat is rendered once its proof-media requests stop for 3 s (max 40 s).
MOCK_LOG="$STATE_DIR/mock.log"
before=$(grep -c 'nativeChat.proofMedia' "$MOCK_LOG" 2>/dev/null || true)
last=$before quiet=0
for _ in $(seq 1 40); do
  sleep 1
  now=$(grep -c 'nativeChat.proofMedia' "$MOCK_LOG" 2>/dev/null || true)
  if ((now > before && now == last)); then quiet=$((quiet + 1)); else quiet=0; fi
  last=$now
  ((quiet >= 3)) && break
done
mark "chat rendered ($((last - before)) proof media requests)"
mark "slow swipes up through the cards (8)"
for _ in $(seq 1 8); do adb_s shell input swipe 540 600 540 1600 500; sleep 0.7; done
mark "swipes back down (8)"
for _ in $(seq 1 8); do adb_s shell input swipe 540 1600 540 600 500; sleep 0.7; done
mark "fling to bottom"
adb_s shell input swipe 540 1700 540 400 120
adb_s shell input swipe 540 1700 540 400 120
sleep 1
mark "small swipes at the bottom (6)"
for i in $(seq 1 6); do
  if ((i % 2)); then adb_s shell input swipe 540 1300 540 1500 250; else adb_s shell input swipe 540 1500 540 1300 250; fi
  sleep 0.5
done
mark "idle at bottom"
sleep 3
mark "end of input; recording continues idle until the 60 s limit"
wait $REC || true
sleep 1
adb_s pull /sdcard/proof-scroll.mp4 "$OUT" >/dev/null
log "video: $OUT"

log "timeline: $TIMELINE"
