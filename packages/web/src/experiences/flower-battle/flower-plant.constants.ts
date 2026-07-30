import { getThemeTokenCssVar } from "@razzoozle/common/theme-tokens"
import type { Team } from "@razzoozle/web/features/game/utils/teams"
import { teamColor } from "@razzoozle/web/features/game/utils/teams"

import flowerHeadBell from "@razzoozle/web/assets/experiences/flower-battle/optimized/fixed/flower-head-bell.svg?raw"
import flowerHeadRound from "@razzoozle/web/assets/experiences/flower-battle/optimized/fixed/flower-head-round.svg?raw"
import flowerHeadSun from "@razzoozle/web/assets/experiences/flower-battle/optimized/fixed/flower-head-sun.svg?raw"
import flowerHeadTulip from "@razzoozle/web/assets/experiences/flower-battle/optimized/fixed/flower-head-tulip.svg?raw"

/** Team colour key — maps to {@link Team} tokens in teams.ts. */
export type TeamColorKey = Team

export type FlowerVariant = "round" | "tulip" | "sun" | "bell"

/** Fixed skeleton anchor ids — identical across all growth stages 0–10. */
export const PLANT_ANCHOR_IDS = [
  "soil-anchor",
  "stem-lower",
  "leaf-left-1",
  "leaf-right-1",
  "stem-upper",
  "leaf-left-2",
  "leaf-right-2",
  "bud",
  "petals",
  "face",
  "status-anchor",
] as const

export type PlantAnchorId = (typeof PLANT_ANCHOR_IDS)[number]

export type PlantPartId =
  | "stem-lower"
  | "leaf-left-1"
  | "leaf-right-1"
  | "stem-upper"
  | "leaf-left-2"
  | "leaf-right-2"
  | "bud"
  | "petals"
  | "face"

export interface PlantPartState {
  opacity: number
  scale: number
}

export interface GrowthStageConfig {
  stage: number
  parts: Record<PlantPartId, PlantPartState>
}

/** Choreography order: stem → leaf → stabilise (same for every stage jump). */
export const PART_CHOREOGRAPHY: PlantPartId[] = [
  "stem-lower",
  "leaf-left-1",
  "leaf-right-1",
  "stem-upper",
  "leaf-left-2",
  "leaf-right-2",
  "bud",
  "petals",
  "face",
]

const hidden = (): PlantPartState => ({ opacity: 0, scale: 0 })
const shown = (scale = 1): PlantPartState => ({ opacity: 1, scale })

const stageParts = (
  overrides: Partial<Record<PlantPartId, PlantPartState>>,
): Record<PlantPartId, PlantPartState> => ({
  "stem-lower": hidden(),
  "leaf-left-1": hidden(),
  "leaf-right-1": hidden(),
  "stem-upper": hidden(),
  "leaf-left-2": hidden(),
  "leaf-right-2": hidden(),
  bud: hidden(),
  petals: hidden(),
  face: hidden(),
  ...overrides,
})

/** Eleven discrete growth stages (0–10) on the same fixed anchor skeleton. */
export const GROWTH_STAGES: GrowthStageConfig[] = [
  { stage: 0, parts: stageParts({}) },
  {
    stage: 1,
    parts: stageParts({ "stem-lower": { opacity: 1, scale: 0.25 } }),
  },
  {
    stage: 2,
    parts: stageParts({ "stem-lower": shown() }),
  },
  {
    stage: 3,
    parts: stageParts({
      "stem-lower": shown(),
      "leaf-left-1": shown(),
    }),
  },
  {
    stage: 4,
    parts: stageParts({
      "stem-lower": shown(),
      "leaf-left-1": shown(),
      "leaf-right-1": shown(),
    }),
  },
  {
    stage: 5,
    parts: stageParts({
      "stem-lower": shown(),
      "leaf-left-1": shown(),
      "leaf-right-1": shown(),
      "stem-upper": shown(),
    }),
  },
  {
    stage: 6,
    parts: stageParts({
      "stem-lower": shown(),
      "leaf-left-1": shown(),
      "leaf-right-1": shown(),
      "stem-upper": shown(),
      "leaf-left-2": shown(),
    }),
  },
  {
    stage: 7,
    parts: stageParts({
      "stem-lower": shown(),
      "leaf-left-1": shown(),
      "leaf-right-1": shown(),
      "stem-upper": shown(),
      "leaf-left-2": shown(),
      "leaf-right-2": shown(),
    }),
  },
  {
    stage: 8,
    parts: stageParts({
      "stem-lower": shown(),
      "leaf-left-1": shown(),
      "leaf-right-1": shown(),
      "stem-upper": shown(),
      "leaf-left-2": shown(),
      "leaf-right-2": shown(),
      bud: shown(0.85),
    }),
  },
  {
    stage: 9,
    parts: stageParts({
      "stem-lower": shown(),
      "leaf-left-1": shown(),
      "leaf-right-1": shown(),
      "stem-upper": shown(),
      "leaf-left-2": shown(),
      "leaf-right-2": shown(),
      bud: shown(0.85),
      petals: shown(0.92),
    }),
  },
  {
    stage: 10,
    parts: stageParts({
      "stem-lower": shown(),
      "leaf-left-1": shown(),
      "leaf-right-1": shown(),
      "stem-upper": shown(),
      "leaf-left-2": shown(),
      "leaf-right-2": shown(),
      bud: shown(0.85),
      petals: shown(),
      face: shown(),
    }),
  },
]

/** Fixed anchor coordinates in the 200×300 viewBox (never change between stages). */
export const ANCHOR_POSITIONS = {
  soil: { x: 100, y: 210 },
  stemLowerOrigin: { x: 100, y: 210 },
  stemLowerTip: { x: 100, y: 168 },
  leafLeft1: { x: 82, y: 188 },
  leafRight1: { x: 118, y: 180 },
  stemUpperOrigin: { x: 100, y: 168 },
  stemUpperTip: { x: 100, y: 128 },
  leafLeft2: { x: 78, y: 148 },
  leafRight2: { x: 122, y: 138 },
  bud: { x: 100, y: 122 },
  petals: { x: 100, y: 108 },
  face: { x: 100, y: 108 },
  status: { x: 100, y: 48 },
} as const

export const GROWTH_STAGE_MIN = 0
export const GROWTH_STAGE_MAX = 10

export const clampGrowthStage = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return GROWTH_STAGE_MIN
  }
  return Math.min(GROWTH_STAGE_MAX, Math.max(GROWTH_STAGE_MIN, Math.round(value)))
}

export interface PlantPalette {
  stem: string
  leaf: string
  petal: string
  bud: string
}

const TEAM_PALETTE: Record<Team, PlantPalette> = {
  red: {
    stem: getThemeTokenCssVar("--team-red-text"),
    leaf: getThemeTokenCssVar("--team-red-ring"),
    petal: getThemeTokenCssVar("--team-red"),
    bud: getThemeTokenCssVar("--team-red-ring"),
  },
  blue: {
    stem: getThemeTokenCssVar("--team-blue-text"),
    leaf: getThemeTokenCssVar("--team-blue-ring"),
    petal: getThemeTokenCssVar("--team-blue"),
    bud: getThemeTokenCssVar("--team-blue-ring"),
  },
  green: {
    stem: getThemeTokenCssVar("--team-green-text"),
    leaf: getThemeTokenCssVar("--team-green-ring"),
    petal: getThemeTokenCssVar("--team-green"),
    bud: getThemeTokenCssVar("--team-green-ring"),
  },
  yellow: {
    stem: getThemeTokenCssVar("--team-yellow-text"),
    leaf: getThemeTokenCssVar("--team-yellow-ring"),
    petal: getThemeTokenCssVar("--team-yellow"),
    bud: getThemeTokenCssVar("--team-yellow-ring"),
  },
}

/** Neutral sage fallback when no team colour is provided. */
export const DEFAULT_PLANT_PALETTE: PlantPalette = {
  stem: getThemeTokenCssVar("--status-online-text"),
  leaf: getThemeTokenCssVar("--team-green-ring"),
  petal: getThemeTokenCssVar("--status-online-bg"),
  bud: getThemeTokenCssVar("--team-green"),
}

export const resolvePlantPalette = (team?: TeamColorKey): PlantPalette => {
  if (!team) return DEFAULT_PLANT_PALETTE
  void teamColor(team)
  return TEAM_PALETTE[team]
}

export const FLOWER_HEAD_SVG: Record<FlowerVariant, string> = {
  round: flowerHeadRound,
  tulip: flowerHeadTulip,
  sun: flowerHeadSun,
  bell: flowerHeadBell,
}

/** Strip outer <svg> wrapper so inner groups can be mounted at an anchor. */
export const extractSvgInner = (svgMarkup: string): string => {
  const match = /<svg[^>]*>([\s\S]*)<\/svg>/i.exec(svgMarkup)
  return match?.[1]?.trim() ?? svgMarkup
}

const extractGroupById = (svgMarkup: string, groupId: string): string => {
  const pattern = new RegExp(
    `<g[^>]*id="${groupId}"[^>]*>[\\s\\S]*?<\\/g>`,
    "i",
  )
  const match = pattern.exec(svgMarkup)
  return match?.[0] ?? ""
}

const buildFlowerHeadParts = (raw: string) => ({
  petals: extractGroupById(raw, "flower-petals"),
  face: extractGroupById(raw, "flower-face"),
  full: extractSvgInner(raw),
})

export const FLOWER_HEAD_PARTS: Record<
  FlowerVariant,
  { petals: string; face: string; full: string }
> = {
  round: buildFlowerHeadParts(flowerHeadRound),
  tulip: buildFlowerHeadParts(flowerHeadTulip),
  sun: buildFlowerHeadParts(flowerHeadSun),
  bell: buildFlowerHeadParts(flowerHeadBell),
}

export const growthStageConfig = (stage: number): GrowthStageConfig => {
  const clamped = clampGrowthStage(stage)
  return GROWTH_STAGES[clamped] ?? GROWTH_STAGES[0]
}

export const GROWTH_ANIMATION_DURATION_S = 1.1
export const REDUCED_MOTION_DURATION_S = 0.18

type TranslateFn = (
  key: string,
  options?: { count?: number; stage?: number; growth?: string; defaultValue?: string },
) => string

export const buildFlowerPlantAriaLabel = (
  stage: number,
  previousStage: number,
  reducedMotion: boolean | null,
  t: TranslateFn,
): string => {
  const growthDelta = Math.max(0, stage - previousStage)
  const growthNote =
    reducedMotion && growthDelta > 0
      ? t("flowerPlant.growthDelta", {
          count: growthDelta,
          defaultValue: `+${growthDelta} Wachstum`,
        })
      : undefined

  if (growthNote) {
    return t("flowerPlant.ariaGrowth", {
      stage,
      growth: growthNote,
      defaultValue: `Blütenpflanze Stufe ${stage}, ${growthNote}`,
    })
  }

  return t("flowerPlant.ariaStage", {
    stage,
    defaultValue: `Blütenpflanze Stufe ${stage}`,
  })
}
