#!/bin/bash

# Token-class grep gate for manager package design tokens (D1/D2/D10).
# Enforces design system token constraints before W1 migration completes.
# Usage: check-manager-tokens.sh [path]
# Defaults to packages/web/src/features/manager if no path given.
#
# Performance: grep-based single-pass (~25ms full tree).
# Output: file:line:TAG 'full-match' format. Matches counted, not lines.
# Lines with token-ok: comments skip entirely (exclusion-list pre-filter).

set -euo pipefail

SCAN_ROOT="${1:-packages/web/src/features/manager}"

if [[ ! -d "$SCAN_ROOT" ]]; then
  echo "Error: scan root '$SCAN_ROOT' does not exist" >&2
  exit 1
fi

TMPFILE=$(mktemp)
EXCLUDE=$(mktemp)
trap "rm -f '$TMPFILE' '$EXCLUDE'" EXIT

# Build exclusion list: file:line pairs with token-ok: comments.
grep -rn 'token-ok:' --include='*.tsx' --include='*.ts' "$SCAN_ROOT" 2>/dev/null | \
  cut -d: -f1,2 | sed 's/$/:/' > "$EXCLUDE" || true

# D1: Forbidden color utilities (full utility name including all prefixes).
# Matches divide-gray-100, placeholder-gray-400, hover:bg-red-500, sm:text-green-50, etc.
# Pattern: utility name (letters, digits, colons, underscores, slashes, hyphens)
# followed by -(color)-[number]
grep -rnoE '[a-zA-Z][a-zA-Z0-9:_/-]*-(gray|red|green|amber|blue)-[0-9]+' \
  --include='*.tsx' --include='*.ts' "$SCAN_ROOT" 2>/dev/null | \
  grep -vF -f "$EXCLUDE" | \
  sed "s/\([^:]*:[^:]*:\)\(.*\)/\1D1 forbidden color token '\2'/" >>"$TMPFILE" || true

# D1: White shorthand utilities (bg-white, text-white).
grep -rnoE '\b(bg-white|text-white)\b' \
  --include='*.tsx' --include='*.ts' "$SCAN_ROOT" 2>/dev/null | \
  grep -vF -f "$EXCLUDE" | \
  sed "s/\([^:]*:[^:]*:\)\(.*\)/\1D1 forbidden white utility '\2'/" >>"$TMPFILE" || true

# D2: Shorthand design-token utilities (must use var() form).
# Matches primary, secondary, accent in full utility form: bg-primary, border-secondary, etc.
grep -rnoE '\b(bg|text|border|ring|outline|from|to)-(primary|secondary|accent)\b' \
  --include='*.tsx' --include='*.ts' "$SCAN_ROOT" 2>/dev/null | \
  grep -vF -f "$EXCLUDE" | \
  sed "s/\([^:]*:[^:]*:\)\(.*\)/\1D2 shorthand '\2' must use var() form (e.g., bg-[var(--color-primary)])/" >>"$TMPFILE" || true

# D10 (SCRIM): bg-black opacity only 40 allowed.
# Matches any bg-black/N (full form), filters to exclude valid bg-black/40.
grep -rnoE 'bg-black/[0-9]+' \
  --include='*.tsx' --include='*.ts' "$SCAN_ROOT" 2>/dev/null | \
  grep -vF -f "$EXCLUDE" | \
  grep -v ':bg-black/40$' | \
  sed "s/\([^:]*:[^:]*:\)\(.*\)/\1D10 SCRIM opacity '\2' invalid (only bg-black\/40 allowed)/" >>"$TMPFILE" || true

# Output findings. Each line is one match (matches counted, not lines).
# Lines with token-ok: comments in source are excluded via pre-filter list.
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
