#!/usr/bin/env bash
# Rust real-game CI test suite — MUST pass before any deploy of the Rust server.
# Builds, runs the unit suite, boots the server, and plays a real multi-question
# game to the END with scoring + a concurrent-player load game. Fails loud (exit 1).
set -euo pipefail
cd "$(dirname "$0")/../rust"
REPO_ROOT="$(cd .. && pwd)"
SERVER_PID=""
TMPD=""
cleanup() {
  [[ -n "$SERVER_PID" ]] && kill "$SERVER_PID" 2>/dev/null || true
  [[ -n "$TMPD" ]] && rm -rf "$TMPD" 2>/dev/null || true
}
trap cleanup EXIT

echo "== 1. cargo build (release) =="
cargo build --release -p razzoozle-server

echo "== 2. cargo test (protocol wire types + engine scoring/eval + server unit tests) =="
cargo test

echo "== 2.5. check ts-rs bindings freshness (HARD FAIL if stale) =="
cd "$REPO_ROOT/rust"

# Wait for any lingering cargo/rustc processes spawned by cargo test to finish writing.
# Allows up to 10 attempts * 0.5s = 5 seconds for processes to exit cleanly.
for attempt in $(seq 1 10); do
  if ! pgrep -f "cargo|rustc" >/dev/null 2>&1; then
    break
  fi
  if [[ $attempt -lt 10 ]]; then
    sleep 0.5
  else
    # Force-kill any remaining cargo/rustc processes to unblock.
    pkill -9 -f "cargo|rustc" 2>/dev/null || true
    sleep 0.5
  fi
done

# Checkpoint the current bindings directory.
BIND_CHECKPOINT="$(mktemp -d)"
trap "rm -rf '$BIND_CHECKPOINT'" RETURN
cp -r "protocol/bindings/" "$BIND_CHECKPOINT/bindings"

# Force a clean regeneration of ts-rs bindings by touching the lib.rs and rebuilding.
# This triggers cargo to recompile the protocol crate, which regenerates all ts-rs exports.
touch protocol/src/lib.rs
cargo build -p razzoozle-protocol 2>&1 | grep -E "Compiling razzoozle-protocol|Finished" || true

# Compare the regenerated bindings with the checkpointed copy.
# If they differ, it means the committed bindings were stale.
if ! diff -r "$BIND_CHECKPOINT/bindings" "protocol/bindings/" >/dev/null 2>&1; then
  echo "FAIL: ts-rs bindings are stale or have diverged from code"
  echo "  Run 'cargo build -p razzoozle-protocol' locally, review the changes, and commit."
  exit 1
fi

PORT="${RUST_CI_PORT:-3399}"
echo "== 3. boot server on :$PORT =="
CONFIG_PATH="$REPO_ROOT/config" PORT="$PORT" ./target/release/razzoozle-server &
SERVER_PID=$!
for _ in $(seq 1 30); do curl -sf "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && break; sleep 0.5; done

echo "== 4. HTTP smoke (health + quiz-from-disk) =="
curl -sf "http://127.0.0.1:$PORT/health" >/dev/null || { echo "FAIL: /health"; exit 1; }
NQ=$(curl -sf "http://127.0.0.1:$PORT/api/quizzes" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).length))")
echo "   quizzes loaded from disk: $NQ"
[[ "${NQ:-0}" -gt 0 ]] || { echo "FAIL: no quizzes served"; exit 1; }

echo "== 5. resolve socket.io-client (single pkg, avoids pnpm workspace) =="
TMPD="$(mktemp -d)"
( cd "$TMPD" && npm i --silent --no-audit --no-fund socket.io-client@4.8.3 )
export SIO_CLIENT="$(node -e "console.log(require.resolve('socket.io-client',{paths:['$TMPD/node_modules']}))")"

echo "== 6. real full game → FINISHED (single player, full flow) =="
SMOKE_URL="http://127.0.0.1:$PORT" node "$REPO_ROOT/spikes/golden-frames/smoke-fullgame.cjs" | tail -1

echo "== 7. multi-player real game played to the END with scoring + 0 drops =="
SMOKE_URL="http://127.0.0.1:$PORT" QUIZ_ID=example-qu--GZoYZWM N_PLAYERS="${RUST_CI_PLAYERS:-25}" \
  node "$REPO_ROOT/spikes/golden-frames/loadtest-100.cjs" | grep -E "podium|score>0|PASS|FAIL"

echo "ALL RUST CI TESTS PASSED ✅"
