#!/usr/bin/env bash
# Design guardrail check — enforces the load-bearing rules from design.md (§2/§7).
# Fails (exit 1) on any violation. Scoped to UNAMBIGUOUS guardrails only:
# modal `bg-black/NN` overlays and the gated/inert glass system in index.css are
# intentionally exempt (design.md §6). Run locally or in CI.
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=packages/web/src
fail=0
note() { printf '\033[31m✗ %s\033[0m\n' "$1"; }

# G1 — no active backdrop-blur/-filter outside the gated glass system (index.css).
hits=$(grep -rniE 'backdrop-blur|backdrop-filter|@supports[^;{]*backdrop' "$SRC" | grep -vE '/index\.css:' || true)
if [[ -n "$hits" ]]; then note "backdrop-blur/filter on live surfaces (use a flat surface):"; echo "$hits"; fail=1; fi

# G8 — no gated glass-* classes on live React surfaces (inert noise / invisible-render risk).
hits=$(grep -rnE 'glass-[0-9]|glass-interactive|glass-bg' "$SRC" --include='*.tsx' || true)
if [[ -n "$hits" ]]; then note "glass-* classes in .tsx (the glass system is gated/inert — remove them):"; echo "$hits"; fail=1; fi

# G7 — scrim must be 0 in the flat default (CSS fallback + DEFAULT_THEME).
grep -qE -- '--bg-scrim:[[:space:]]*0[[:space:]]*;' "$SRC/index.css" || {
  note "--bg-scrim must be 0 in index.css:"; grep -nE -- '--bg-scrim' "$SRC/index.css" || true; fail=1; }
if grep -rqE 'scrim:[[:space:]]*[1-9]' packages/common/src/types/theme.ts 2>/dev/null; then
  note "DEFAULT_THEME.scrim must be 0:"; grep -nE 'scrim:' packages/common/src/types/theme.ts; fail=1; fi

if [[ "$fail" -eq 0 ]]; then printf '\033[32m✓ design guardrails pass\033[0m\n'; fi
exit "$fail"
