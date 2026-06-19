import type { IconName } from "./iconRegistry";
import { ACHIEVEMENT_META } from "../utils/achievements";
import type { AchievementTier } from "../utils/achievements";

export const ACHIEVEMENT_GLYPH: Record<string, IconName> = {
  first_correct: "check_circle",
  participation: "confirmation_number",
  lucky_guess: "casino",
  speed_demon: "bolt",
  streak_3: "local_fire_department",
  sharpshooter: "gps_fixed",
  climber: "trending_up",
  first_responder: "military_tech",
  streak_5: "local_fire_department",
  underdog: "rocket_launch",
  perfect_round: "verified",
  streak_10: "local_fire_department",
  speedy_gonzales: "speed",
  perfect_game: "emoji_events",
};

export const FALLBACK_GLYPH: IconName = "emoji_events";

export function getAchievementVisual(id: string): { glyph: IconName; tier: AchievementTier } {
  return {
    glyph: ACHIEVEMENT_GLYPH[id] ?? FALLBACK_GLYPH,
    tier: ACHIEVEMENT_META[id]?.tier ?? "bronze",
  };
}
