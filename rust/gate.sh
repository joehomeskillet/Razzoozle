#!/usr/bin/env bash
# rust/gate.sh — deterministic orchestrator gate for the Rust server.
# Run this on EVERY worker return BEFORE committing. Never trust a worker's
# self-report ("build passes", "pre-existing error") — this is the source of truth.
#
# It fails LOUD (exit 1 + NO-GO) if:
#   - the server crate or its tests do not compile
#   - any shipped-batch FEATURE MARKER disappeared (= a worker reverted prior work)
#   - main.rs shrank below the known-good floor (= wholesale rewrite / mass deletion)
#
# Usage: bash rust/gate.sh   (from repo root or rust/)
# NOTE: -e is deliberately OMITTED — this gate must run ALL checks and accumulate
# `fail`, not abort on the first non-matching grep. -uo pipefail stay on.
set -uo pipefail
cd "$(dirname "$0")" || exit 2  # -> rust/
MAIN="server/src/main.rs"
STATE="server/src/state.rs"
fail=0
say() { printf '%s\n' "$*"; }

# --- 1. compile (bin) + tests -------------------------------------------------
BUILD_ERR=$(cargo build -p razzoozle-server 2>&1 | grep -cE '^error(\[|:)')
TEST_ERR=$(cargo test --no-run 2>&1 | grep -cE '^error(\[|:)')
[[ "$BUILD_ERR" -ne 0 ]] && { say "NO-GO: cargo build has $BUILD_ERR error(s)"; fail=1; }
[[ "$TEST_ERR" -ne 0 ]] && { say "NO-GO: cargo test build has $TEST_ERR error(s)"; fail=1; }

# --- 2. anti-regression feature markers (each shipped batch leaves a fingerprint)
# min counts are floors; a drop means a batch was reverted/deleted.
check() { # <file> <pattern> <min> <label>
  local n; n=$(grep -cE "$2" "$1" 2>/dev/null || true); n=${n:-0}
  if [[ "$n" -lt "$3" ]]; then say "NO-GO: marker '$4' = $n (< $3 in $1) — a batch was reverted"; fail=1
  else say "ok: $4 = $n"; fi
}
check "$MAIN"  'AnswerInput'                     8  "B2 answer-types (AnswerInput)"
check "$MAIN"  'evaluate_answer'                 1  "B2 eval wiring"
check "$MAIN"  'REMOVE_PLAYER|remove_player'     1  "B3 player-lifecycle"
check "$MAIN"  'SHOW_RESPONSES|show_responses'   1  "B3 SHOW_RESPONSES"
check "$STATE" 'load_quizzes'                    1  "B4 quiz-from-disk"
check "$MAIN"  'handle_get_quizzes'              1  "B4 HTTP routes"
check "$MAIN"  'is_logged'                       2  "B5 auth gate"
check "$MAIN"  'constants::manager::AUTH'        1  "B5 manager:auth"
check "$MAIN"  'next_or_finish'                  1  "round-loop advance"

# --- 3. size floor (main.rs only grows; hard floor = last known-good minus slack)
LINES=$(wc -l < "$MAIN")
FLOOR=1250
[[ "$LINES" -lt "$FLOOR" ]] && { say "NO-GO: $MAIN = $LINES lines (< floor $FLOOR) — likely wholesale rewrite"; fail=1; } || say "ok: $MAIN = $LINES lines"

# --- verdict ------------------------------------------------------------------
if [[ "$fail" -eq 0 ]]; then say "GO ✅ (build+tests compile, all batch markers intact)"; exit 0
else say "GATE FAILED ❌ — DISCARD worker output: git checkout HEAD -- rust/server/src/{main,state}.rs"; exit 1; fi
