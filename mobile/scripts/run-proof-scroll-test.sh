#!/usr/bin/env bash
# Records a scroll test of the Android chat over a long transcript full of proof, project and
# Slack cards and diagrams, served by the mock host (MOCK_CHAT_SCENARIO=proof-scroll), with a reply
# streaming in at the bottom. Exits 1 on a scroll jump (proof-scroll-jumps.mjs, from the page's own
# scroll geometry, which proof-scroll-probe.js reports through the mock host): the view moving back
# toward the top while the reader moves it down or leaves it, moving while idle, not staying at the
# end while a reply streams, or a row drawn again at another height. Repeatable per APK.
#
#   mobile/scripts/run-proof-scroll-test.sh <apk> <output.mp4>
#
# The chat is the desktop's page bundle (what the app's web shell draws): BUNDLE (default
# out/mobile-web, from `pnpm build:mobile-web`), served with the probe added. A mock host already
# running keeps the bundle it started with; stop it (port $PORT) after rebuilding the bundle.
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
BUNDLE=${BUNDLE:-$MOBILE_DIR/../out/mobile-web}
[[ -f "$BUNDLE/manifest.json" ]] || { echo "no mobile web bundle at $BUNDLE (pnpm build:mobile-web)"; exit 1; }
BUNDLE=$(cd "$BUNDLE" && pwd)
STREAM_FILE="$STATE_DIR/stream-token"
PROBE_LOG="$STATE_DIR/probe.log"
(cd "$MOBILE_DIR" && npx tsx scripts/proof-scroll-probe-bundle.ts "$BUNDLE" "$STATE_DIR/probe-bundle") >/dev/null
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
    MOCK_SERVER_KEY_FILE="$STATE_DIR/mock-key.json" MOCK_CHAT_STREAM_FILE="$STREAM_FILE" \
    MOCK_MOBILE_WEB_BUNDLE_DIR="$STATE_DIR/probe-bundle" MOCK_PROBE_LOG="$PROBE_LOG" \
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
# A full emulator /data refuses an in-place update; the app is cleared below anyway.
adb_s install -r "$APK" >/dev/null 2>&1 || { adb_s uninstall "$PKG" >/dev/null; adb_s install "$APK" >/dev/null; }
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
)
[[ -n "$point" ]] || { log "workspace list never showed manta-1"; exit 1; }

# --- record ---------------------------------------------------------------------------------
TIMELINE="$OUT.timeline.txt"
PHASES="$OUT.phases.json"
: >"$TIMELINE"
: >"$PROBE_LOG"
adb_s shell rm -f /sdcard/proof-scroll.mp4
START=$(python3 -c 'import time; print(time.time())')
adb_s shell screenrecord --time-limit 120 --bit-rate 8000000 /sdcard/proof-scroll.mp4 &
REC=$!
sleep 1
now() { python3 -c "import time; print(f'{time.time()-$START:.1f}')"; }
epoch_ms() { python3 -c 'import time; print(int(time.time() * 1000))'; }
mark() { printf '%6ss  %s\n' "$(now)" "$1" | tee -a "$TIMELINE"; }
# Each checked phase runs from its mark to the next one.
phase_list=() phase_open=''
close_phase() {
  [[ -n "$phase_open" ]] && phase_list+=("$phase_open,\"to\":$(epoch_ms)}")
  phase_open=''
}
phase() { # <name> <checks, comma-separated>
  close_phase
  mark "$1"
  local checks
  checks=$(printf '"%s",' ${2//,/ })
  phase_open="{\"name\":\"$1\",\"checks\":[${checks%,}],\"from\":$(epoch_ms)"
}
swipe_down_page() { adb_s shell input swipe 540 1600 540 600 "${1:-500}"; } # finger up: toward the end
swipe_up_page() { adb_s shell input swipe 540 600 540 1600 "${1:-500}"; }   # finger down: toward the top

mark "open chat (tap manta-1)"
adb_s shell input tap $point
# uiautomator never sees an idle screen while proof video plays, so readiness is read from the
# host instead: the chat is rendered once its proof-media requests stop for 3 s (max 40 s).
MOCK_LOG="$STATE_DIR/mock.log"
before=$(grep -c 'nativeChat.proofMedia' "$MOCK_LOG" 2>/dev/null || true)
last=$before quiet=0
for _ in $(seq 1 40); do
  sleep 1
  now_count=$(grep -c 'nativeChat.proofMedia' "$MOCK_LOG" 2>/dev/null || true)
  if ((now_count > before && now_count == last)); then quiet=$((quiet + 1)); else quiet=0; fi
  last=$now_count
  ((quiet >= 3)) && break
done
mark "chat rendered ($((last - before)) proof media requests)"
phase "slow swipes up through the cards (8)" none
for _ in $(seq 1 8); do swipe_up_page; sleep 0.7; done
phase "swipes back down (8)" back
for _ in $(seq 1 8); do swipe_down_page; sleep 0.7; done
phase "fling to the end" back
swipe_down_page 120
swipe_down_page 120
sleep 2
phase "idle at the end" still,end
sleep 3
phase "reply streams in, reader at the end" back,end
echo "stream-$(date +%s)" >"$STREAM_FILE"
sleep 6
phase "reader looks up while it streams" none
swipe_up_page 400
sleep 1.5
phase "reader flings back to the end while it streams" back
swipe_down_page 120
swipe_down_page 120
sleep 1
phase "stays at the end while it streams" back,end
sleep 10
phase "a swipe toward the end after it streamed" back,end
swipe_down_page 300
sleep 1.5
close_phase
mark "end of input"
adb_s shell pkill -INT screenrecord >/dev/null 2>&1 || true
wait $REC || true
sleep 2
adb_s pull /sdcard/proof-scroll.mp4 "$OUT" >/dev/null
printf '[%s]\n' "$(IFS=,; echo "${phase_list[*]}")" >"$PHASES"
log "video: $OUT"
log "timeline: $TIMELINE"
sleep 1 # the probe's last batch
cp "$PROBE_LOG" "$OUT.probe.log"
log "probe: $OUT.probe.log"
node "$MOBILE_DIR/scripts/proof-scroll-jumps.mjs" "$OUT.probe.log" "$PHASES"
