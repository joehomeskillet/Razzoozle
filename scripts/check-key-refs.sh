#!/bin/bash
# check-key-refs.sh — Gate script for manager locale key coverage
# Extracts all static t("manager:...") key references from code and
# validates they exist in the German locale file. Dynamic keys (${var}) are logged and skipped.

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCALE_FILE="$REPO_ROOT/packages/web/src/locales/de/manager.json"
WEB_SRC="$REPO_ROOT/packages/web/src"

if [[ ! -f "$LOCALE_FILE" ]]; then
  echo "Error: Locale file not found: $LOCALE_FILE"
  exit 1
fi

# Extract all t("manager:KEY) calls from TypeScript/TSX files
# Grep pattern: t("manager:SOMEKEY
# Capture group: SOMEKEY (up to closing quote or paren)

declare -a MISSING_KEYS
declare -a DYNAMIC_KEYS

# Search for t("manager:KEY patterns
while IFS= read -r line; do
  # Extract manager locale keys using regex
  # Pattern: t("manager:KEY[", or t("manager:KEY)
  if [[ $line =~ t\(\"manager:([^\"]+)\" ]]; then
    key="${BASH_REMATCH[1]}"

    # Check if key contains template syntax (dynamic key)
    if [[ $key =~ \$\{ ]]; then
      DYNAMIC_KEYS+=("$key")
    else
      # Convert key path to JSON path (manager:tab.sub -> manager.tab.sub)
      json_key=$(echo "$key" | sed 's/:/\./')

      # Check if key exists in JSON
      if ! jq -e ".$json_key" "$LOCALE_FILE" > /dev/null 2>&1; then
        MISSING_KEYS+=("$key")
      fi
    fi
  fi
done < <(grep -r 't("manager:' "$WEB_SRC" --include="*.tsx" --include="*.ts" 2>/dev/null || true)

# Report results
EXIT_CODE=0

if [[ ${#MISSING_KEYS[@]} -gt 0 ]]; then
  echo "ERROR: Missing locale keys in $LOCALE_FILE:"
  for key in "${MISSING_KEYS[@]}"; do
    echo "  - manager:$key"
  done
  EXIT_CODE=1
fi

if [[ ${#DYNAMIC_KEYS[@]} -gt 0 ]]; then
  echo "INFO: Found ${#DYNAMIC_KEYS[@]} dynamic locale keys (skipped validation):"
  for key in "${DYNAMIC_KEYS[@]}"; do
    echo "  - manager:$key"
  done | head -10
  [[ ${#DYNAMIC_KEYS[@]} -gt 10 ]] && echo "  ... and $((${#DYNAMIC_KEYS[@]} - 10)) more"
fi

if [[ $EXIT_CODE -eq 0 ]]; then
  echo "✓ All static manager locale keys are defined."
fi

exit $EXIT_CODE
