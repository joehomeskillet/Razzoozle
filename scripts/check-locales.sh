#!/usr/bin/env bash
# Gate: every web locale JSON must parse, across ALL namespaces (manager, game,
# errors, common, …) and all locales. Catches (a) workers committing broken
# JSON and (b) textual git auto-merges that mangle adjacent key additions —
# both happened on 2026-07-14 (zh/game.json invalid on a branch; fr/it lost
# keys in a clean-looking merge).
# Also warns (non-blocking) when a namespace's key set differs across
# locales — DEEP/recursive (dotted paths), so nested keys like
# labels.colors.red are caught too, not just top-level keys. Uses
# scripts/locale-sync.mjs check (node, no extra deps) for the recursion.
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0
for f in packages/web/src/locales/*/*.json; do
  if ! python3 -m json.tool "$f" > /dev/null 2>&1; then
    echo "INVALID JSON: $f"
    fail=1
  fi
done

if [ "$fail" -eq 0 ]; then
  node scripts/locale-sync.mjs check
  echo "LOCALES OK"
else
  exit 1
fi
