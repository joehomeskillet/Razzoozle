#!/usr/bin/env bash
# scripts/detect-gaps.sh — finds exported functions/consts in
# packages/socket/src/services/**/*.ts that have NO matching unit test in a
# neighbor __tests__/ folder. Emits one JSON line per gap to stdout:
#   {"file": "<path>", "exports": ["name1", "name2"]}
#
# Test-gap definition: a source file counts as covered only if
# <same-dir>/__tests__/<basename>.test.ts exists — mirrors the co-located
# __tests__ convention already used throughout packages/socket/src. Files
# with zero exported functions/consts are skipped (nothing to test).
#
# Usage: bash scripts/detect-gaps.sh   (callable from anywhere; cd's to repo root)
set -euo pipefail
cd "$(dirname "$0")/.." || exit 2

SERVICES_DIR="packages/socket/src/services"
# Matches `export [async] function NAME` or `export const NAME` and captures NAME.
NAME_RE='(?<=^export (async )?function )[A-Za-z0-9_]+|(?<=^export const )[A-Za-z0-9_]+'

while IFS= read -r -d '' file; do
  # Skip test files themselves and anything already under a __tests__ dir.
  case "$file" in
    *__tests__/*|*.test.ts) continue ;;
  esac

  names=""
  names=$(grep -oP "$NAME_RE" "$file" 2>/dev/null || true)
  [[ -z "$names" ]] && continue

  dir=$(dirname "$file")
  base=$(basename "$file" .ts)
  test_file="$dir/__tests__/$base.test.ts"
  [[ -f "$test_file" ]] && continue

  mapfile -t name_arr <<<"$names"
  json_exports="["
  sep=""
  for name in "${name_arr[@]}"; do
    json_exports+="${sep}\"${name}\""
    sep=","
  done
  json_exports+="]"

  printf '{"file": "%s", "exports": %s}\n' "$file" "$json_exports"
done < <(find "$SERVICES_DIR" -type f -name '*.ts' -print0)
