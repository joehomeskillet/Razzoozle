#!/usr/bin/env bash
# scripts/web-gate.sh — deterministic orchestrator gate for the web workspace.
# Run this on EVERY worker return BEFORE committing web/UI changes. Never trust
# a worker's self-report ("build passes", "types are fine") — this is the
# source of truth. Mirrors rust/gate.sh: same structure, same GO/NO-GO output,
# so both gates read the same way.
#
# It bundles what today is scattered across package.json scripts and
# .gitea/workflows/ci.yml's lint-typecheck job into one pipeline:
#   - typecheck (all packages)
#   - manager token-class gate (blocking)
#   - unified design token gate (tokens:gate, blocking)
#   - question-type consistency gate (blocking)
#   - test suites (all packages, if present)
#   - oxlint (advisory — CI runs it warn-only, we mirror that here)
#
# Usage: bash scripts/web-gate.sh   (from repo root or scripts/)
# NOTE: -e is deliberately OMITTED — this gate must run ALL checks and
# accumulate `fail`, not abort on the first failing step. -uo pipefail stay on.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2  # -> repo root
fail=0
say() { printf '%s\n' "$*"; }

# --- 1. typecheck (BLOCKING) --------------------------------------------------
if pnpm -r run types; then say "ok: typecheck (all packages) clean"
else say "NO-GO: typecheck failed (pnpm -r run types)"; fail=1; fi

# --- 2. manager design token gate (BLOCKING) ----------------------------------
# Token-class grep gate (D1/D2/D10/D-GRAD) for the manager package — see
# scripts/check-manager-tokens.sh header.
if bash scripts/check-manager-tokens.sh; then say "ok: manager design tokens clean"
else say "NO-GO: manager design token gate failed (see above)"; fail=1; fi

# --- 3. unified design token gate (BLOCKING) -----------------------------------
# tokens:gate runs the FULL token verification chain (validate, hex-lint,
# wasm, morph, neural, ai-audit, daemon, agent-rule-sync) in one deterministic
# pipeline — see scripts/design-gate.mjs.
if pnpm tokens:gate; then say "ok: unified design token gate passed"
else say "NO-GO: unified design token gate failed (run 'pnpm tokens:gate' for details)"; fail=1; fi

# --- 4. question type consistency (BLOCKING) ----------------------------------
# QUESTION_TYPES must be present at all touchpoints (constants, validators,
# editor, answers, rust engine) — see scripts/check-question-types.sh header.
if bash scripts/check-question-types.sh; then say "ok: question types valid"
else say "NO-GO: question type consistency failed (see above)"; fail=1; fi

# --- 5. test suites (BLOCKING) -------------------------------------------------
if pnpm -r --if-present run test; then say "ok: test suites (all packages) green"
else say "NO-GO: test suite(s) reported failures (pnpm -r --if-present run test)"; fail=1; fi

# --- 6. oxlint (ADVISORY — non-blocking) --------------------------------------
# CI runs this warn-only (.gitea/workflows/ci.yml "Lint (warn-only)"); mirrored
# here so it never masks a real gate failure above.
say "--- advisory (non-blocking): oxlint ---"
if pnpm exec oxlint >/dev/null 2>&1; then say "advisory: oxlint clean"
else say "advisory: oxlint reported findings (not blocking)"; fi

# --- verdict -------------------------------------------------------------------
if [[ "$fail" -eq 0 ]]; then say "GO ✅ (typecheck+tokens+tests green)"; exit 0
else say "GATE FAILED ❌ — DISCARD worker output (drop the worktree, fix, re-run)"; exit 1; fi
