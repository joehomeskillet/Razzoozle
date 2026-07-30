// z-index.ts — zentrale Layer-Konstanten für Experience-Stage.
// Einziger Ort für Z-Werte (single source of truth). Keine Domain-Logik.

export const EXPERIENCE_Z_INDEX = {
  background: 1,
  actors: 2,
  effects: 3,
  hud: 4,
  overlay: 5,
} as const

export type ExperienceLayerName = keyof typeof EXPERIENCE_Z_INDEX
