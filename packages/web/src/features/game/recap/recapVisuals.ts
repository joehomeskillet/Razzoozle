/**
 * Recap key → Material-Symbol glyph maps. Replaces the inline emoji used by the
 * recap screens with vendored icon glyphs (see iconRegistry.ts). Exhaustive over
 * both recap unions so a missing key is a compile error.
 */
import type { IconName } from "@razzoozle/web/features/game/achievements/iconRegistry"
import type { SuperlativeKey, RoundRecapKey } from "@razzoozle/common/types/game"

export const SUPERLATIVE_GLYPH: Record<SuperlativeKey, IconName> = {
  fastest_finger: "bolt",
  most_correct: "gps_fixed",
  most_wrong: "visibility_off",
  longest_streak: "local_fire_department",
  biggest_climber: "trending_up",
  lucky_guesser: "casino",
  comeback_kid: "rocket_launch",
  most_achievements: "military_tech",
  hardest_question: "psychology",
}

export const ROUND_RECAP_GLYPH: Record<RoundRecapKey, IconName> = {
  fastest_finger: "bolt",
  first_correct: "check_circle",
  streak: "local_fire_department",
  highest_round_score: "verified",
  rank_climber: "trending_up",
  achievement_unlock: "military_tech",
  slowest_player: "hourglass_empty",
  most_wrong: "visibility_off",
}

export const RECAP_FINAL_GLYPH: IconName = "emoji_events"
