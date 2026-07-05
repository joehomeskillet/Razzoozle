#!/usr/bin/env bash
# Twin-parity harness: boots Node + Rust backends, runs identical flows, diffs results.
# Usage: scripts/twin-parity.sh [--target node|rust|both] [--output parity-report.json] [--quiz-id quiz-id]
# Exit: 0 if critical_pass=true, 1 if divergences found or errors

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${TARGET:-both}"
OUTPUT_REPORT="${OUTPUT_REPORT:-parity-report.json}"
QUIZ_ID="${QUIZ_ID:-example-qu--GZoYZWM}"
VERBOSE="${VERBOSE:-0}"

NODE_PORT=3310
RUST_PORT=3311
OUTPUT_DIR="${REPO_ROOT}/tmp/parity-output"
NODE_PID=""
RUST_PID=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="$2"; shift 2 ;;
    --output) OUTPUT_REPORT="$2"; shift 2 ;;
    --quiz-id) QUIZ_ID="$2"; shift 2 ;;
    --verbose) VERBOSE=1; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Make OUTPUT_REPORT absolute
if [[ ! "$OUTPUT_REPORT" = /* ]]; then
  OUTPUT_REPORT="$(pwd)/$OUTPUT_REPORT"
fi

cleanup() {
  [[ -n "$NODE_PID" ]] && kill "$NODE_PID" 2>/dev/null || true
  [[ -n "$RUST_PID" ]] && kill "$RUST_PID" 2>/dev/null || true
  # Keep output files for inspection
  echo "[twin-parity] Cleanup complete"
}

trap cleanup EXIT

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"
rm -rf "$OUTPUT_DIR"/{node,rust}
mkdir -p "$OUTPUT_DIR"/{node,rust}

# Helper: wait for server to be ready
wait_for_server() {
  local port=$1
  local max_attempts=60
  for i in $(seq 1 $max_attempts); do
    if curl -sf "http://127.0.0.1:$port/health" >/dev/null 2>&1; then
      echo "[twin-parity] Port $port ready after ~$((i * 500))ms"
      return 0
    fi
    sleep 0.5
  done
  echo "[twin-parity] FAIL: Port $port never became ready"
  return 1
}

# Boot Node backend
boot_node() {
  echo "[twin-parity] Booting Node backend on port $NODE_PORT..."
  cd "$REPO_ROOT"
  export WS_PORT="$NODE_PORT"
  export CONFIG_PATH="$REPO_ROOT/config"
  pnpm --filter socket start >"$OUTPUT_DIR/node.boot.log" 2>&1 &
  NODE_PID=$!
  sleep 1
  if ! wait_for_server $NODE_PORT; then
    echo "[twin-parity] Node boot failed. Log:"
    tail -20 "$OUTPUT_DIR/node.boot.log"
    return 1
  fi
  echo "[twin-parity] Node backend ready on port $NODE_PORT"
}

# Boot Rust backend (reuse rust-ci-test.sh pattern)
boot_rust() {
  echo "[twin-parity] Booting Rust backend on port $RUST_PORT..."
  cd "$REPO_ROOT/rust"

  # Build if not already built
  if [[ ! -f "target/release/razzoozle-server" ]]; then
    echo "[twin-parity] Building Rust server..."
    cargo build --release -p razzoozle-server >/dev/null 2>&1
  fi

  export CONFIG_PATH="$REPO_ROOT/config"
  export PORT="$RUST_PORT"
  ./target/release/razzoozle-server >"$OUTPUT_DIR/rust.boot.log" 2>&1 &
  RUST_PID=$!
  sleep 1
  if ! wait_for_server $RUST_PORT; then
    echo "[twin-parity] Rust boot failed. Log:"
    tail -20 "$OUTPUT_DIR/rust.boot.log"
    return 1
  fi
  echo "[twin-parity] Rust backend ready on port $RUST_PORT"
}

# Run orchestrator
run_orchestrator() {
  local node_url="http://127.0.0.1:$NODE_PORT"
  local rust_url="http://127.0.0.1:$RUST_PORT"

  echo "[twin-parity] Running flows..."
  cd "$REPO_ROOT"

  # Ensure socket.io-client is available
  if [[ ! -d "node_modules/.pnpm/socket.io-client@4.8.3" ]]; then
    echo "[twin-parity] Installing socket.io-client..."
    pnpm add socket.io-client@4.8.3 >/dev/null 2>&1 || true
  fi

  export NODE_URL="$node_url"
  export RUST_URL="$rust_url"
  export OUTPUT_DIR="$OUTPUT_DIR"
  export OUTPUT_REPORT="$OUTPUT_REPORT"
  export QUIZ_ID="$QUIZ_ID"
  export VERBOSE="$VERBOSE"

  # Run the orchestrator script
  node "$REPO_ROOT/scripts/twin-parity-orchestrator.cjs"
}

# Main
main() {
  echo "[twin-parity] Starting parity harness (target=$TARGET, quiz=$QUIZ_ID)"
  echo "[twin-parity] Output report: $OUTPUT_REPORT"

  if [[ "$TARGET" == "node" ]] || [[ "$TARGET" == "both" ]]; then
    boot_node || exit 1
  fi

  if [[ "$TARGET" == "rust" ]] || [[ "$TARGET" == "both" ]]; then
    boot_rust || exit 1
  fi

  if ! run_orchestrator; then
    echo "[twin-parity] Orchestrator failed"
    exit 1
  fi

  # Read the report
  if [[ -f "$OUTPUT_REPORT" ]]; then
    CRITICAL_PASS=$(jq -r '.summary.critical_pass // false' "$OUTPUT_REPORT")
    DIVERGENCES=$(jq -r '.summary.divergences // 0' "$OUTPUT_REPORT")

    echo ""
    echo "[twin-parity] REPORT: critical_pass=$CRITICAL_PASS, divergences=$DIVERGENCES"
    echo "[twin-parity] Full report: $OUTPUT_REPORT"

    if [[ "$CRITICAL_PASS" == "true" ]]; then
      echo "[twin-parity] PASS ✅"
      return 0
    else
      echo "[twin-parity] FAIL ❌ (critical divergences detected)"
      return 1
    fi
  else
    echo "[twin-parity] FAIL: Report not generated at $OUTPUT_REPORT"
    return 1
  fi
}

main "$@"
