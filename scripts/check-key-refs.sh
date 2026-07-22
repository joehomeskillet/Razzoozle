#!/bin/bash
# check-key-refs.sh — Gate script for manager locale key coverage
# Extracts static t("manager:KEY") calls and validates keys exist in de/manager.json.
# Skips dynamic keys (string concatenation, template literals).

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCALE_FILE="$REPO_ROOT/packages/web/src/locales/de/manager.json"
WEB_SRC="$REPO_ROOT/packages/web/src"

if [[ ! -f "$LOCALE_FILE" ]]; then
  echo "Error: Locale file not found: $LOCALE_FILE"
  exit 1
fi

declare -a MISSING_KEYS

# Find all files with t("manager: calls
find "$WEB_SRC" -type f \( -name "*.tsx" -o -name "*.ts" \) | while read -r file; do
  # Extract lines with t("manager: calls
  grep -n 't("manager:' "$file" 2>/dev/null | while IFS=: read -r linenum line; do
    # Skip lines with string concatenation or template syntax
    if [[ $line == *" + "* ]] || [[ $line == *'+ '* ]] || [[ $line == *'${'* ]]; then
      continue
    fi
    
    # Extract all t("manager:KEY") patterns from the line.
    # Require a non-identifier char (or start of line) before "t(" so calls
    # like CustomEvent("manager:...") aren't mistaken for t("manager:...").
    while [[ $line =~ (^|[^A-Za-z0-9_])t\(\"manager:([^\"]+)\" ]]; do
      key="${BASH_REMATCH[2]}"
      line="${line#*${BASH_REMATCH[0]}}"
      
      # Skip if key contains template syntax (shouldn't happen, but double-check)
      if [[ $key == *'${'* ]]; then
        continue
      fi
      
      # Convert key to JSON path
      json_key=$(echo "$key" | sed 's/:/\./')
      
      # Check if key exists
      if ! jq -e ".$json_key" "$LOCALE_FILE" > /dev/null 2>&1; then
        echo "$key"
      fi
    done
  done
done | sort | uniq > /tmp/missing_keys.txt

EXIT_CODE=0
if [[ -s /tmp/missing_keys.txt ]]; then
  echo "ERROR: Missing locale keys in $LOCALE_FILE:"
  while read -r key; do
    echo "  - manager:$key"
  done < /tmp/missing_keys.txt
  EXIT_CODE=1
else
  echo "✓ All static manager locale keys are defined."
fi

exit $EXIT_CODE
