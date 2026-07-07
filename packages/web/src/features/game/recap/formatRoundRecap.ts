/**
 * Pure formatting helpers for the per-round recap strip.
 * Emoji map is local; labels come from i18n via `roundRecapLabelKey`.
 * No React/JSX — display-only string formatting.
 */
import type { RoundRecapKey } from "@razzoozle/common/types/game"

export const ROUND_RECAP_EMOJI: Record<RoundRecapKey, string> = {
  fastest_finger: "⚡",
  first_correct: "✅",
  streak: "🔥",
  highest_round_score: "💯",
  rank_climber: "🧗",
  achievement_unlock: "🏅",
  slowest_player: "🐢",
  most_wrong: "🙈",
}

export function formatRoundRecapValue(
  key: RoundRecapKey,
  value: number | undefined,
): string {
  if (value === undefined) return ""

  switch (key) {
    case "fastest_finger":
    case "slowest_player":
      return `${(value / 1000).toFixed(1)}s`
    case "streak":
    case "highest_round_score":
    case "rank_climber":
    case "most_wrong":
      return `${value}`
    case "first_correct":
    case "achievement_unlock":
      return ""
  }
}

export function roundRecapLabelKey(key: RoundRecapKey): string {
  return `game:roundRecap.${key}`
}
