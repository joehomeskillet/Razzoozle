#!/bin/bash

# Token-class grep gate for manager package design tokens (D1/D2/D10).
# Enforces design system token constraints before W1 migration completes.
# Usage: check-manager-tokens.sh [path]
# Defaults to packages/web/src/features/manager if no path given.

set -o pipefail

SCAN_ROOT="${1:-packages/web/src/features/manager}"

if [[ ! -d "$SCAN_ROOT" ]]; then
  echo "Error: scan root '$SCAN_ROOT' does not exist" >&2
  exit 1
fi

FINDINGS=0

# D1: Forbidden color utilities (Tailwind hardcoded color tokens).
# Pattern: (color-prefix)-(gray|red|green|amber|blue)-(number)
# Also: bg-white, text-white (pure white banned in favor of design tokens).
D1_PATTERN='(bg|text|border|ring|outline|shadow|from|to|via)-(gray|red|green|amber|blue)-[0-9]+'

# Alternative D1 patterns for white shorthand.
D1_WHITE_PATTERN='\b(bg-white|text-white)\b'

# D2: Shorthand utilities for design tokens — only var() form allowed.
# Pattern: (bg|text|border|ring|outline|from|to)-(primary|secondary|accent)
# FORBIDDEN: these hardcoded forms; only `bg-[var(--color-primary)]` etc. allowed.
D2_PATTERN='\b(bg|text|border|ring|outline|from|to)-(primary|secondary|accent)\b'

# D10 (SCRIM): bg-black/N only allowed as exactly bg-black/40.
# All other opacities on bg-black are violations.
D10_PATTERN='bg-black/(?!40\b)'

TMPFILE=$(mktemp)
trap "rm -f $TMPFILE" EXIT

# Scan all .ts and .tsx files.
while IFS= read -r file; do
  [[ -z "$file" ]] && continue

  LINE_NUM=0
  while IFS= read -r line; do
    ((LINE_NUM++))

    # Skip lines with token-ok: override marker.
    if [[ "$line" =~ token-ok: ]]; then
      continue
    fi

    # D1: Hardcoded color utilities.
    if grep -qE "$D1_PATTERN" <<<"$line"; then
      # Extract the match for output.
      match=$(grep -oE "$D1_PATTERN" <<<"$line" | head -1)
      echo "$file:$LINE_NUM:D1 forbidden color token '$match'" >>"$TMPFILE"
      ((FINDINGS++))
    fi

    # D1: White shorthand.
    if grep -qE "$D1_WHITE_PATTERN" <<<"$line"; then
      match=$(grep -oE "$D1_WHITE_PATTERN" <<<"$line" | head -1)
      echo "$file:$LINE_NUM:D1 forbidden white utility '$match'" >>"$TMPFILE"
      ((FINDINGS++))
    fi

    # D2: Shorthand design-token utilities (must use var() form).
    if grep -qE "$D2_PATTERN" <<<"$line"; then
      match=$(grep -oE "$D2_PATTERN" <<<"$line" | head -1)
      echo "$file:$LINE_NUM:D2 shorthand '$match' must use var() form (e.g., bg-[var(--color-primary)])" >>"$TMPFILE"
      ((FINDINGS++))
    fi

    # D10: bg-black opacity only 40 allowed.
    if grep -qE 'bg-black/' <<<"$line"; then
      # Check if it's NOT exactly bg-black/40.
      if ! grep -qE 'bg-black/40\b' <<<"$line"; then
        match=$(grep -oE 'bg-black/[0-9]+' <<<"$line" | head -1)
        echo "$file:$LINE_NUM:D10 SCRIM opacity '$match' invalid (only bg-black/40 allowed)" >>"$TMPFILE"
        ((FINDINGS++))
      fi
    fi

  done < "$file"
done < <(find "$SCAN_ROOT" -type f \( -name "*.ts" -o -name "*.tsx" \) 2>/dev/null)

# Output findings in order.
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
