#!/usr/bin/env bash
# Gate: every web locale JSON must parse, across ALL namespaces (manager, game,
# errors, common, …) and all locales. Catches (a) workers committing broken
# JSON and (b) textual git auto-merges that mangle adjacent key additions —
# both happened on 2026-07-14 (zh/game.json invalid on a branch; fr/it lost
# keys in a clean-looking merge).
# Also warns (non-blocking) when a namespace's top-level key sets differ
# across locales, which surfaces silently-lost translations early.
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0
for f in packages/web/src/locales/*/*.json; do
  if ! python3 -m json.tool "$f" > /dev/null 2>&1; then
    echo "INVALID JSON: $f"
    fail=1
  fi
done

python3 - <<'PY'
import collections, glob, json, os
ns = collections.defaultdict(dict)
for f in glob.glob('packages/web/src/locales/*/*.json'):
    loc = f.split(os.sep)[-2]
    name = os.path.basename(f)
    try:
        ns[name][loc] = set(json.load(open(f)).keys())
    except Exception:
        pass  # invalid files are reported (blocking) by the loop above
for name, locs in sorted(ns.items()):
    all_keys = set().union(*locs.values())
    for loc, keys in sorted(locs.items()):
        missing = all_keys - keys
        if missing:
            print(f"WARN key-parity {name} [{loc}] missing top-level keys: {sorted(missing)[:6]}")
PY

if [ "$fail" -eq 0 ]; then
  echo "LOCALES OK"
else
  exit 1
fi
