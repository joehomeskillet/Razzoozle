// Free-text answer normalization + matching for the `type-answer` question type.
// Server-only (no browser import): it runs in the socket package as part of the
// authoritative scoring path. The matching itself never leaves the server — only
// the boolean "correct" verdict flows to a player (anti-cheat). The web package
// keeps its own browser-safe copy (see the type-answer spec §5.1); this file is
// NOT imported across the package boundary.

// Canonical comparison form: trim surrounding whitespace, lowercase, then strip
// combining diacritics via NFD decomposition (so "Café" === "cafe"). Used both
// for `matchMode === "normalized"` matching and for the manager-only text
// histogram bucket key, so bar heights stay accurate across case/accent variants.
export function normalizeText(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

// Standard Levenshtein edit distance (iterative DP, single rolling row). O(m·n)
// time / O(n) space — trivially cheap for the ≤200-char strings the validator
// caps both accepted answers and submissions at. Used only by `matchMode ===
// "fuzzy"`.
export function levenshtein(a: string, b: string): number {
  if (a === b) {
    return 0
  }

  if (a.length === 0) {
    return b.length
  }

  if (b.length === 0) {
    return a.length
  }

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  const curr = new Array<number>(b.length + 1)

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost, // substitution
      )
    }

    // Swap rows (copy, since `curr` is reused next iteration).
    prev = curr.slice()
  }

  return prev[b.length]
}

// Fuzzy tolerance: one allowed edit per 10 chars of the (normalized) accepted
// answer, with a floor of 1 so even very short answers tolerate a single typo.
const fuzzyThreshold = (s: string): number =>
  Math.max(1, Math.floor(s.length / 10))

// Decide whether a submitted free-text answer matches ANY of the authored
// accepted answers under the given match mode. Defaults to "normalized" (the
// validator leaves matchMode optional). Returns a bare boolean — no accepted
// answer ever flows back to the caller's player-facing payload.
export function matchAnswer(
  submitted: string,
  acceptedAnswers: string[],
  matchMode: "exact" | "normalized" | "fuzzy" = "normalized",
): boolean {
  const norm = normalizeText(submitted)

  for (const accepted of acceptedAnswers) {
    if (matchMode === "exact") {
      if (submitted === accepted) {
        return true
      }
    } else if (matchMode === "normalized") {
      if (norm === normalizeText(accepted)) {
        return true
      }
    } else {
      const normAccepted = normalizeText(accepted)

      if (levenshtein(norm, normAccepted) <= fuzzyThreshold(normAccepted)) {
        return true
      }
    }
  }

  return false
}
