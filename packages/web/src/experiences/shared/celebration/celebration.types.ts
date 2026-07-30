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
  // Stacking override for full-screen celebration kinds (e.g. "award-reveal")
  // that render above specific chrome. Omitted callers get the adapter's
  // default confetti z-index.
  zIndex?: number
}
