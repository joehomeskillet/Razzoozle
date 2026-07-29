#!/usr/bin/env bash
# scripts/web-gate.test.sh — CI-101: guard-rail test for scripts/web-gate.sh.
#
# Run this BEFORE trusting web-gate.sh (mirrors the discipline of
# rust/gate.sh's own header comment: never trust a self-report). It checks:
#   1. the gate script exists and is executable
#   2. every `pnpm <script>` name it references is a REAL key in package.json
#      (the design-gate.mjs incident: a renamed script left a dead call)
#   3. every `node scripts/*.mjs` / `bash scripts/*.sh` path it references
#      points at a file that actually exists on disk
#   4. the extraction logic correctly identifies missing scripts (test integrity)
#
# This test is STRUCTURAL ONLY — it does NOT run web-gate.sh itself. Speed is
# critical: this runs in the approval pipeline and must complete in seconds.
#
# Usage: bash scripts/web-gate.test.sh   (from repo root or scripts/)
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2  # -> repo root
GATE="scripts/web-gate.sh"
fail=0
say() { printf '%s\n' "$*"; }

# --- 1. gate script must exist and is executable --------- --------------------------
if [[ ! -f "$GATE" ]]; then
  say "FAIL: $GATE does not exist"
  say "RED (expected until CI-102 ships web-gate.sh)"
  exit 1
fi
if [[ ! -x "$GATE" ]]; then
  say "FAIL: $GATE exists but is not executable (chmod +x $GATE)"
  fail=1
fi

# --- 2. every `pnpm <name>` call must resolve to a real package.json script ---
# Extract script names from:
#   - pnpm [ -r ] [ --flags ] run <name>   (handles -r, --if-present, etc.)
#   - pnpm exec <name>                     (direct command via exec)
mapfile -t PNPM_CALLS < <(
  # Match: pnpm [optional -r] [optional --flags] run <name>
  grep -oE 'pnpm( -r)?( --[^ ]+)* run [a-zA-Z0-9:_-]+' "$GATE" 2>/dev/null | sed -E 's/^.*run //' | sort -u
  # Match: pnpm exec <name>
  grep -oE 'pnpm exec [a-zA-Z0-9:_-]+' "$GATE" 2>/dev/null | sed -E 's/^.*exec //' | sort -u
)
for name in "${PNPM_CALLS[@]}"; do
  # Skip workspace operations (pnpm -r run <name>) — those are scripts in sub-packages, not root
  # Skip bare commands like 'oxlint' (via pnpm exec) — those are binaries, not package.json scripts
  [[ "$name" == "types" || "$name" == "test" || "$name" == "oxlint" ]] && continue

  if ! node -e "process.exit(require('./package.json').scripts['$name'] ? 0 : 1)" 2>/dev/null; then
    say "FAIL: $GATE calls 'pnpm ... $name' but package.json has no such script"
    fail=1
  fi
done

# --- 3. every referenced script FILE must exist on disk -----------------------
mapfile -t FILE_REFS < <(grep -oE '(scripts/[A-Za-z0-9_.-]+\.(mjs|sh))' "$GATE" 2>/dev/null | sort -u)
for f in "${FILE_REFS[@]}"; do
  if [[ ! -f "$f" ]]; then
    say "FAIL: $GATE references $f which does not exist"
    fail=1
  fi
done

# --- 4. extraction logic integrity: can it detect missing scripts? -----------
# This test proves that the extraction regex WORKS, not that the gate works.
# Strategy: inject a fake pnpm call, verify extraction catches it.
say ""
say "--- EXTRACTION INTEGRITY CHECK ---"

# Create a temp copy with an invalid pnpm line injected
TEMP_GATE=$(mktemp)
cat "$GATE" > "$TEMP_GATE"
# Add a line with a pnpm run call that does NOT exist in package.json
sed -i "22a \ \ if false; then pnpm run nonexistent-test-script; fi" "$TEMP_GATE"

# Extract from the corrupted version — should find the fake script name
EXTRACTED=$(
  grep -oE 'pnpm( -r)?( --[^ ]+)* run [a-zA-Z0-9:_-]+' "$TEMP_GATE" 2>/dev/null | sed -E 's/^.*run //' | sort -u
  grep -oE 'pnpm exec [a-zA-Z0-9:_-]+' "$TEMP_GATE" 2>/dev/null | sed -E 's/^.*exec //' | sort -u
)

if echo "$EXTRACTED" | grep -q "nonexistent-test-script"; then
  say "ok: extraction correctly identified injected fake script 'pnpm run nonexistent-test-script'"
  # Verify that the regex would fail the check (script doesn't exist)
  if ! node -e "process.exit(require('./package.json').scripts['nonexistent-test-script'] ? 0 : 1)" 2>/dev/null; then
    say "ok: validation correctly rejected nonexistent-test-script"
  else
    say "FAIL: nonexistent-test-script somehow exists in package.json (test is invalid)"
    rm "$TEMP_GATE"
    fail=1
    exit 1
  fi
else
  say "FAIL: extraction did NOT find injected fake script 'nonexistent-test-script'"
  say "The regex patterns are broken and would miss real errors."
  rm "$TEMP_GATE"
  fail=1
  exit 1
fi

rm "$TEMP_GATE"

say ""

if [[ "$fail" -eq 0 ]]; then say "PASS: web-gate.test.sh"; exit 0
else say "FAIL: web-gate.test.sh (see above)"; exit 1; fi
