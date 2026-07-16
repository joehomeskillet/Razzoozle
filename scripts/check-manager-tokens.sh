#!/bin/bash

# Token-class grep gate for manager package design tokens (D1/D2/D10).
# Enforces design system token constraints before W1 migration completes.
# Usage: check-manager-tokens.sh [path]
# Defaults to packages/web/src/features/manager if no path given.
#
# Performance: grep-based single-pass (~8ms full tree) vs line-by-line bash (~64s).
# Output: file:line:TAG message format. Matches counted, not lines.
# Lines with token-ok: comments skip entirely.

set -euo pipefail

SCAN_ROOT="${1:-packages/web/src/features/manager}"

if [[ ! -d "$SCAN_ROOT" ]]; then
  echo "Error: scan root '$SCAN_ROOT' does not exist" >&2
  exit 1
fi

TMPFILE=$(mktemp)
trap "rm -f '$TMPFILE'" EXIT

# D1: Forbidden color utilities (unanchored prefix pattern).
# Matches divide-gray-100, placeholder-blue-50, bg-red-500, etc.
# Pattern: any -(gray|red|green|amber|blue)-[digit]
grep -rnE -- '-(gray|red|green|amber|blue)-[0-9]+' \
  --include='*.tsx' --include='*.ts' "$SCAN_ROOT" 2>/dev/null | \
  grep -v 'token-ok:' | \
  sed -E 's/^([^:]+):([^:]+):(.*)(-(gray|red|green|amber|blue)-[0-9]+)(.*)/\1:\2:\4/' | \
  sed "s/\([^:]*:[^:]*:\)\(.*\)/\1D1 forbidden color token '\2'/" >>"$TMPFILE" || true

# D1: White shorthand utilities (bg-white, text-white).
grep -rnE '\b(bg-white|text-white)\b' \
  --include='*.tsx' --include='*.ts' "$SCAN_ROOT" 2>/dev/null | \
  grep -v 'token-ok:' | \
  sed -E 's/^([^:]+):([^:]+):(.*)\b(bg-white|text-white)\b(.*)/\1:\2:\4/' | \
  sed "s/\([^:]*:[^:]*:\)\(.*\)/\1D1 forbidden white utility '\2'/" >>"$TMPFILE" || true

# D2: Shorthand design-token utilities (must use var() form).
# Matches primary, secondary, accent in shorthand (e.g., bg-primary, border-secondary).
grep -rnE '\b(bg|text|border|ring|outline|from|to)-(primary|secondary|accent)\b' \
  --include='*.tsx' --include='*.ts' "$SCAN_ROOT" 2>/dev/null | \
  grep -v 'token-ok:' | \
  sed -E 's/^([^:]+):([^:]+):(.*)\b((bg|text|border|ring|outline|from|to)-(primary|secondary|accent))\b(.*)/\1:\2:\4/' | \
  sed "s/\([^:]*:[^:]*:\)\(.*\)/\1D2 shorthand '\2' must use var() form (e.g., bg-[var(--color-primary)])/" >>"$TMPFILE" || true

# D10 (SCRIM): bg-black opacity only 40 allowed.
# Uses -o to extract just the opacity value, filters to exclude valid bg-black/40.
grep -rnoE 'bg-black/[0-9]+' \
  --include='*.tsx' --include='*.ts' "$SCAN_ROOT" 2>/dev/null | \
  grep -v 'token-ok:' | \
  grep -v ':bg-black/40$' | \
  sed "s/\([^:]*:[^:]*:\)\(.*\)/\1D10 SCRIM opacity '\2' invalid (only bg-black\/40 allowed)/" >>"$TMPFILE" || true

# Output findings. Each line is one match (matches counted, not lines).
# Lines with token-ok: comments in source are skipped entirely.
FINDINGS=$(wc -l < "$TMPFILE")

if [[ -s "$TMPFILE" ]]; then
  sort "$TMPFILE"
fi

echo ""
echo "Total findings: $FINDINGS"

if [[ $FINDINGS -gt 0 ]]; then
  exit 1
else
  exit 0
fi
