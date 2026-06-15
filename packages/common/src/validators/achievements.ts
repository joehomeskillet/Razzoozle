import { z } from "zod"

import { BONUS_MAX } from "@razzoozle/common/achievements"

// Persisted shape for config/achievements.json.
// Each key is an achievement id; missing ids fall back to registry defaults
// (enabled=true, name/description=null, threshold=registry default, bonus=0).
export const achievementsConfigValidator = z.record(
  z.string(),
  z.object({
    enabled: z.boolean().optional(),
    name: z.string().max(60).optional(),
    description: z.string().max(200).optional(),
    threshold: z.number().optional(),
    // Bonus points awarded when the badge unlocks. Clamped to [0, 5000].
    bonus: z.number().int().min(0).max(BONUS_MAX).optional(),
  }),
)

export type AchievementsConfig = z.infer<typeof achievementsConfigValidator>
