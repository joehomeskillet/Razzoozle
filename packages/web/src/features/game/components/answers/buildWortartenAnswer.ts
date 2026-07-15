/**
 * buildWortartenAnswer — Pure function to build the Wortarten answer array.
 *
 * Converts the per-token POS choices into the wire format expected by the server:
 * a JSON-stringified array where:
 * - Active (non-disabled) tokens contain the chosen POS label string
 * - Disabled tokens contain empty string ""
 *
 * Contract matches rust/engine/src/eval.rs Wortarten arm:
 * The server decodes the JSON array and scores each position independently,
 * skipping disabled indices in the scoring logic.
 *
 * @param choices - Array of POS label strings, one per token (null = unset)
 * @param disabledTokens - Optional array of token indices that are disabled
 * @returns The POS label array formatted as the server expects (no JSON.stringify here)
 *
 * @example
 * const choices = ["Nomen", "Verb", "Adjektiv"];
 * const disabled = [1];
 * const answer = buildWortartenAnswer(choices, disabled);
 * // => ["Nomen", "", "Adjektiv"]
 * // Wire: JSON.stringify(answer) => '["Nomen","","Adjektiv"]'
 */
export function buildWortartenAnswer(
  choices: Array<string | null>,
  disabledTokens?: number[],
): string[] {
  return choices.map((choice, idx) => {
    const isDisabled = disabledTokens?.includes(idx) ?? false
    return isDisabled ? "" : (choice ?? "")
  })
}
