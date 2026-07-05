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
SRC="server/src"     # whole server crate — markers may live in main.rs OR any src/socket/*.rs
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
check() { # <path> <pattern> <min> <label> — recursive count across the whole tree
  local n; n=$(grep -rE "$2" "$1" 2>/dev/null | wc -l); n=${n:-0}
  if [[ "$n" -lt "$3" ]]; then say "NO-GO: marker '$4' = $n (< $3 in $1) — a batch was reverted"; fail=1
  else say "ok: $4 = $n"; fi
}
# Counts across the whole server crate (main.rs OR src/socket/*.rs — survives
# modularization). A DROP below the floor = a batch/handler was reverted/deleted.
check "$SRC"   'answer_keys|answer_text|AnswerInput' 12 "B2 answer-types"
check "$SRC"   'evaluate_answer'                 2  "B2 eval wiring"
check "$SRC"   'REMOVE_PLAYER|remove_player'     2  "B3 player-lifecycle"
check "$STATE" 'load_quizzes'                    2  "B4 quiz-from-disk"
check "$SRC"   'handle_get_quizzes'              2  "B4 HTTP routes"
check "$SRC"   'is_logged'                       8  "B5 auth gate"
check "$SRC"   'constants::manager::AUTH'        1  "B5 manager:auth"
check "$SRC"   'next_or_finish'                  1  "round-loop advance"

# --- 3. total-source floor (code moves between files during modularization but is
# never mass-deleted; the SUM of server/src lines only grows). Guards wholesale loss.
LINES=$(find "$SRC" -name '*.rs' -exec cat {} + | wc -l)
FLOOR=2400
[[ "$LINES" -lt "$FLOOR" ]] && { say "NO-GO: total $SRC = $LINES lines (< floor $FLOOR) — mass deletion"; fail=1; } || say "ok: total $SRC = $LINES lines"

# --- verdict ------------------------------------------------------------------
if [[ "$fail" -eq 0 ]]; then say "GO ✅ (build+tests compile, all batch markers intact)"; exit 0
else say "GATE FAILED ❌ — DISCARD worker output (drop the worktree, or git checkout HEAD -- rust/server/src)"; exit 1; fi
