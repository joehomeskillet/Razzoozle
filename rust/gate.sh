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
STATE="server/src/state"
fail=0
say() { printf '%s\n' "$*"; }

# --- 1. compile (bin) + tests -------------------------------------------------
BUILD_ERR=$(cargo build -p razzoozle-server 2>&1 | grep -cE '^error(\[|:)')
[[ "$BUILD_ERR" -ne 0 ]] && { say "NO-GO: cargo build has $BUILD_ERR error(s)"; fail=1; }

# Whole-workspace tests. Prefer cargo-nextest (faster, clearer output) when it is
# installed — same coverage, and it actually RUNS the suite now that the engine
# golden-frames fixture exists. Fall back to the original compile-only check
# (`cargo test --no-run`) where nextest is absent (e.g. an old local shell).
if command -v cargo-nextest >/dev/null 2>&1; then
  if cargo nextest run --workspace --no-fail-fast; then say "ok: cargo nextest run (workspace) green"
  else say "NO-GO: cargo nextest run reported failing or uncompilable tests"; fail=1; fi
else
  TEST_ERR=$(cargo test --no-run 2>&1 | grep -cE '^error(\[|:)')
  [[ "$TEST_ERR" -ne 0 ]] && { say "NO-GO: cargo test build has $TEST_ERR error(s)"; fail=1; }
fi

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
check "$SRC"   'require_user|require_admin' 30 "B5 auth gate (session)"
check "$SRC"   'session_user' 2 "B5 session auth"
check "$SRC"   'next_or_finish'                  1  "round-loop advance"

# --- 3. total-source floor (code moves between files during modularization but is
# never mass-deleted; the SUM of server/src lines only grows). Guards wholesale loss.
LINES=$(find "$SRC" -name '*.rs' -exec cat {} + | wc -l)
FLOOR=2400
[[ "$LINES" -lt "$FLOOR" ]] && { say "NO-GO: total $SRC = $LINES lines (< floor $FLOOR) — mass deletion"; fail=1; } || say "ok: total $SRC = $LINES lines"

# --- 4. advisory (NON-BLOCKING) rustfmt + clippy — report only, never fail -----
# Informational only: it NEVER touches `fail`, so pre-existing clippy/format noise
# cannot break CI. Runs only when the tools are present (rust-toolchain.toml adds
# clippy+rustfmt on CI). Kept last so it can't mask a real gate failure above.
say "--- advisory (non-blocking): rustfmt + clippy ---"
if command -v rustfmt >/dev/null 2>&1; then
  if cargo fmt --all --check >/dev/null 2>&1; then say "advisory: rustfmt clean"
  else say "advisory: rustfmt would reformat some files (not blocking)"; fi
fi
if command -v cargo-clippy >/dev/null 2>&1; then
  CLIPPY_N=$(cargo clippy --workspace --all-targets 2>&1 | grep -cE '^warning|^error')
  say "advisory: clippy emitted $CLIPPY_N warning/error line(s) (not blocking)"
fi

# --- 5. locale JSON validity (BLOCKING) — every web locale namespace must parse.
# Added 2026-07-14 after a worker committed invalid zh/game.json and a textual
# auto-merge mangled fr/it (see scripts/check-locales.sh header). Cheap (~1s),
# python3-only, works in bare worktrees without node_modules.
if [[ -x "$(dirname "$0")/../scripts/check-locales.sh" ]] || [[ -f "$(dirname "$0")/../scripts/check-locales.sh" ]]; then
  if bash "$(dirname "$0")/../scripts/check-locales.sh" | tail -5; then say "ok: locale JSONs valid"
  else say "NO-GO: invalid locale JSON (see above)"; fail=1; fi
fi

# --- verdict ------------------------------------------------------------------
if [[ "$fail" -eq 0 ]]; then say "GO ✅ (build+tests compile, all batch markers intact)"; exit 0
else say "GATE FAILED ❌ — DISCARD worker output (drop the worktree, or git checkout HEAD -- rust/server/src)"; exit 1; fi
