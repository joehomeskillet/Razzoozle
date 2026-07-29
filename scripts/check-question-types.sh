#!/usr/bin/env bash
# Anti-wildwuchs gate: each QUESTION_TYPES entry must appear at key touchpoints.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Extract QUESTION_TYPES from constants.ts
mapfile -t TYPES < <(
  awk '/export const QUESTION_TYPES/,/\]/' packages/common/src/constants.ts \
    | grep -oE '"[a-z0-9-]+"' | tr -d '"'
)
if [[ ${#TYPES[@]} -eq 0 ]]; then
  TYPES=(choice boolean slider poll multiple-select type-answer sentence-builder mathematik wortarten sequencing fill-blank matching drop-pin word-cloud brainstorm confidence micro-lesson)
fi

missing=0

# Helper: convert kebab-case to PascalCase for Rust enum variants
# e.g. "word-cloud" -> "WordCloud", "type-answer" -> "TypeAnswer"
kebab_to_pascal() {
  local input="$1"
  # Split on hyphens, capitalize each part, join with no separator
  echo "$input" | sed 's/-/\n/g' | sed 's/^./\U&/' | paste -sd '' -
}

check() {
  local type="$1" file="$2"
  if [[ ! -f "$file" ]]; then
    echo "MISSING $type $file"
    missing=$((missing+1))
    return
  fi
  # Search for the type as a string literal (in double or single quotes),
  # not as a substring. This avoids false positives like "choice" matching "a choice" in comments.
  if ! (grep -qF "\"$type\"" "$file" || grep -qF "'$type'" "$file"); then
    echo "MISSING $type $file"
    missing=$((missing+1))
  fi
}

check_rust_variant() {
  local type="$1"
  local pascal_type=$(kebab_to_pascal "$type")

  # Look for QuestionType::<PascalCase> in eval.rs and reveal_helpers.rs
  if ! grep -Fq "QuestionType::${pascal_type}" rust/engine/src/eval.rs 2>/dev/null \
     && ! grep -Fq "QuestionType::${pascal_type}" rust/server/src/socket/reveal_helpers.rs 2>/dev/null; then
    echo "MISSING $type rust/engine|reveal_helpers (QuestionType::${pascal_type})"
    missing=$((missing+1))
  fi
}

for type in "${TYPES[@]}"; do
  # EXCEPTION: choice and boolean are handled by the terminal else-branch in superRefine
  # (they implement the default question semantics). An explicit literal would be dead code.
  if [[ "$type" != "choice" && "$type" != "boolean" ]]; then
    check "$type" packages/common/src/validators/quizz.ts
  fi

  # editor: either file counts
  if ! (grep -qF "\"$type\"" packages/web/src/features/quizz/components/QuestionEditor/index.tsx 2>/dev/null || grep -qF "'$type'" packages/web/src/features/quizz/components/QuestionEditor/index.tsx 2>/dev/null) \
     && ! (grep -qF "\"$type\"" packages/web/src/features/quizz/components/QuestionEditor/QuestionEditorType.tsx 2>/dev/null || grep -qF "'$type'" packages/web/src/features/quizz/components/QuestionEditor/QuestionEditorType.tsx 2>/dev/null); then
    echo "MISSING $type packages/web/src/features/quizz/components/QuestionEditor"
    missing=$((missing+1))
  fi

  check "$type" packages/web/src/features/game/components/states/Answers.tsx

  # NOTE: Result.tsx discriminates via the 'poll' flag in the SHOW_RESULT payload,
  # not via type slugs. It cannot be checked via text search for type names.

  # Check Rust engine: use PascalCase variant names, not kebab-case slugs
  check_rust_variant "$type"
done

# NEW: Strict set comparison between QuestionType.ts (ts-rs bindings) and constants.ts
# This catches mismatches due to stale bindings or misspelled serde(rename) attributes.
echo ""
echo "=== Bindings Freshness Check ==="

# Extract the union type from QuestionType.ts
# Format: export type QuestionType = "choice" | "boolean" | ... ;
declare -a BINDINGS_TYPES
mapfile -t BINDINGS_TYPES < <(
  grep 'export type QuestionType' rust/protocol/bindings/QuestionType.ts \
    | sed 's/.*= //' | sed 's/ *;$//' | tr '|' '\n' | sed 's/[" ]//g' | grep -v '^$'
)

# Sort both arrays for comparison
IFS=$'\n' TYPES_SORTED=($(sort <(printf '%s\n' "${TYPES[@]}")))
IFS=$'\n' BINDINGS_SORTED=($(sort <(printf '%s\n' "${BINDINGS_TYPES[@]}")))

# Find in TYPES but not in BINDINGS (bindings are stale)
for t in "${TYPES_SORTED[@]}"; do
  found=0
  for b in "${BINDINGS_SORTED[@]}"; do
    if [[ "$t" == "$b" ]]; then
      found=1
      break
    fi
  done
  if [[ $found -eq 0 ]]; then
    echo "MISSING in bindings: $t (rust/protocol/bindings/QuestionType.ts)"
    missing=$((missing+1))
  fi
done

# Find in BINDINGS but not in TYPES (extra/wrong entries)
for b in "${BINDINGS_SORTED[@]}"; do
  found=0
  for t in "${TYPES_SORTED[@]}"; do
    if [[ "$b" == "$t" ]]; then
      found=1
      break
    fi
  done
  if [[ $found -eq 0 ]]; then
    echo "EXTRA in bindings: $b (should be removed from rust/protocol/bindings/QuestionType.ts)"
    missing=$((missing+1))
  fi
done

if [[ $missing -eq 0 ]]; then
  echo "OK"
  exit 0
fi
echo "FAIL $missing"
exit 1
