#!/usr/bin/env bash
# Anti-wildwuchs gate: each QUESTION_TYPES entry must appear at key touchpoints.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

mapfile -t TYPES < <(
  awk '/export const QUESTION_TYPES/,/\]/' packages/common/src/constants.ts \
    | grep -oE '"[a-z0-9-]+"' | tr -d '"'
)
if [[ ${#TYPES[@]} -eq 0 ]]; then
  TYPES=(choice boolean slider poll multiple-select type-answer sentence-builder mathematik wortarten sequencing fill-blank matching drop-pin)
fi

missing=0
check() {
  local type="$1" file="$2"
  if [[ ! -f "$file" ]]; then
    echo "MISSING $type $file"
    missing=$((missing+1))
    return
  fi
  if ! grep -Fq -- "$type" "$file"; then
    echo "MISSING $type $file"
    missing=$((missing+1))
  fi
}

for type in "${TYPES[@]}"; do
  check "$type" packages/common/src/validators/quizz.ts
  # editor: either file counts
  if ! grep -Fq -- "$type" packages/web/src/features/quizz/components/QuestionEditor/index.tsx 2>/dev/null \
     && ! grep -Fq -- "$type" packages/web/src/features/quizz/components/QuestionEditor/QuestionEditorType.tsx 2>/dev/null; then
    echo "MISSING $type packages/web/src/features/quizz/components/QuestionEditor"
    missing=$((missing+1))
  fi
  check "$type" packages/web/src/features/game/components/states/Answers.tsx
  if [[ "$type" != "poll" ]]; then
    check "$type" packages/web/src/features/game/components/states/Result.tsx
  fi
  if ! grep -Fq -- "$type" rust/engine/src/eval.rs 2>/dev/null \
     && ! grep -Fq -- "$type" rust/server/src/socket/reveal_helpers.rs 2>/dev/null; then
    echo "MISSING $type rust/engine|reveal_helpers"
    missing=$((missing+1))
  fi
done

if [[ $missing -eq 0 ]]; then
  echo "OK"
  exit 0
fi
echo "FAIL $missing"
exit 1
