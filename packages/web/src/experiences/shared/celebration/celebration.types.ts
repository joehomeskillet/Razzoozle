import type { ExperienceEffectColorRole } from "../types/experience-effect"

export type CelebrationRequest = {
  id: string
  kind: string
  origin?: {
    x: number
    y: number
  }
  colorRoles?: ExperienceEffectColorRole[]
  durationMs?: number
  revision?: number
  achievementIds?: string[]
}
