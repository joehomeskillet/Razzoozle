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
#   4. running the gate on a clean tree exits 0 and prints a GO verdict
#
# Usage: bash scripts/web-gate.test.sh   (from repo root or scripts/)
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2  # -> repo root
GATE="scripts/web-gate.sh"
fail=0
say() { printf '%s\n' "$*"; }

# --- 1. gate script must exist and be executable ------------------------------
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
#   - pnpm [flags] run <name>   (handles -r, --if-present, etc.)
#   - pnpm exec <name>           (direct command via exec)
mapfile -t PNPM_CALLS < <(
  # Match: pnpm -r ... run <name> OR pnpm run <name>
  grep -oE 'pnpm (-r|--[^ ]+)* run [a-zA-Z0-9:_-]+' "$GATE" 2>/dev/null | sed -E 's/^.*run //' | sort -u
  # Match: pnpm exec <name>
  grep -oE 'pnpm exec [a-zA-Z0-9:_-]+' "$GATE" 2>/dev/null | sed -E 's/^.*exec //' | sort -u
)
for name in "${PNPM_CALLS[@]}"; do
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

# --- 4. clean-tree run must exit 0 with a GO verdict --------------------------
if [[ -f "$GATE" && -x "$GATE" ]]; then
  OUT=$(bash "$GATE" 2>&1)
  RC=$?
  if [[ "$RC" -ne 0 ]]; then
    say "FAIL: $GATE exited $RC on a clean tree (expected 0/GO)"
    say "$OUT" | tail -20
    fail=1
  elif ! grep -q '^GO' <<<"$OUT"; then
    say "FAIL: $GATE exited 0 but printed no GO verdict line"
    fail=1
  else
    say "ok: $GATE clean-tree run is GO"
  fi
fi

# --- 5. PRÜFUNG: Ungültiges pnpm-Script wird erkannt ---------------------------
# Temporär eine ungültige pnpm-Zeile in web-gate.sh einfügen und prüfen,
# dass der Test fehlschlägt. Dann Test-State zurücksetzen.
#
# Diese Prüfung stellt sicher, dass das Test-Script wirklich die Script-Namen
# extrahiert und nicht nur "alles okay" sagt.

say ""
say "--- INTEGRITY CHECK: Can test detect a missing pnpm script? ---"

# Backup original
cp "$GATE" "${GATE}.bak"

# Inject bad pnpm call (this script does NOT exist in package.json)
sed -i "1a pnpm nonexistent-fake-script" "$GATE"

# Run test on the corrupted gate (should FAIL)
if ! bash scripts/web-gate.test.sh >/dev/null 2>&1; then
  say "ok: test correctly REJECTED corrupted gate (injected 'nonexistent-fake-script')"
else
  say "FAIL: test did NOT catch the missing script 'nonexistent-fake-script'"
  say "The test's pnpm extraction is broken."
  cp "${GATE}.bak" "$GATE"
  rm "${GATE}.bak"
  fail=1
  exit 1
fi

# Restore original
cp "${GATE}.bak" "$GATE"
rm "${GATE}.bak"

say "ok: gate integrity check passed (bad script detection works)"
say ""

if [[ "$fail" -eq 0 ]]; then say "PASS: web-gate.test.sh"; exit 0
else say "FAIL: web-gate.test.sh (see above)"; exit 1; fi
