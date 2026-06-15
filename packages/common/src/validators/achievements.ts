import { z } from "zod"

// Persisted shape for config/achievements.json.
// Each key is an achievement id; missing ids fall back to registry defaults
// (enabled=true, name/description=null, threshold=registry default).
export const achievementsConfigValidator = z.record(
  z.string(),
  z.object({
    enabled: z.boolean().optional(),
    name: z.string().max(60).optional(),
    description: z.string().max(200).optional(),
    threshold: z.number().optional(),
  }),
)

export type AchievementsConfig = z.infer<typeof achievementsConfigValidator>
