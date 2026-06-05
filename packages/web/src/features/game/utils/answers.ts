// Leaf module: answer color/label data + helpers.
// No component imports here so importers don't form an ESM cycle with
// constants.ts (which maps STATUS -> state components).

// Colors come from runtime theme CSS vars (--answer-1..4); see features/theme.
export const ANSWERS_COLORS = [
  "bg-[var(--answer-1)] text-[var(--answer-text)]",
  "bg-[var(--answer-2)] text-[var(--answer-text)]",
  "bg-[var(--answer-3)] text-[var(--answer-text)]",
  "bg-[var(--answer-4)] text-[var(--answer-text)]",
]

export const ANSWERS_LABELS = ["A", "B", "C", "D"]

export function answerColor(i: number): string {
  return ANSWERS_COLORS[i % ANSWERS_COLORS.length]
}

export function answerLabel(i: number): string {
  return ANSWERS_LABELS[i % ANSWERS_LABELS.length]
}
