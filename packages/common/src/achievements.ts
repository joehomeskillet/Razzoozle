// Single source of truth for achievement definitions.
// Registry drives server computation, validator, and client display.

export type AchievementTier = "bronze" | "silver" | "gold" | "diamant"

interface ThresholdDef {
  key: string
  default: number
  unit: string
  min: number
  max: number
}

interface RegistryEntry {
  id: string
  tier: AchievementTier
  threshold?: ThresholdDef
}

export const ACHIEVEMENTS_REGISTRY = [
  // Bronze
  { id: "first_correct", tier: "bronze" },
  { id: "participation", tier: "bronze" },
  {
    id: "lucky_guess",
    tier: "bronze",
    threshold: { key: "lastPercent", default: 5, unit: "%", min: 1, max: 50 },
  },
  // Silver
  {
    id: "speed_demon",
    tier: "silver",
    threshold: { key: "maxMs", default: 1000, unit: "ms", min: 200, max: 5000 },
  },
  {
    id: "streak_3",
    tier: "silver",
    threshold: { key: "streak", default: 3, unit: "×", min: 2, max: 20 },
  },
  {
    id: "sharpshooter",
    tier: "silver",
    threshold: {
      key: "minAccuracyPct",
      default: 95,
      unit: "%",
      min: 50,
      max: 100,
    },
  },
  {
    id: "climber",
    tier: "silver",
    threshold: {
      key: "minRanksUp",
      default: 3,
      unit: "Plätze",
      min: 1,
      max: 20,
    },
  },
  // Gold
  { id: "first_responder", tier: "gold" },
  {
    id: "streak_5",
    tier: "gold",
    threshold: { key: "streak", default: 5, unit: "×", min: 2, max: 30 },
  },
  {
    id: "underdog",
    tier: "gold",
    threshold: {
      key: "minPointsAhead",
      default: 2000,
      unit: "Pkt",
      min: 100,
      max: 100000,
    },
  },
  {
    id: "perfect_round",
    tier: "gold",
    threshold: { key: "streak", default: 5, unit: "×", min: 2, max: 30 },
  },
  // Diamant
  {
    id: "streak_10",
    tier: "diamant",
    threshold: { key: "streak", default: 10, unit: "×", min: 2, max: 50 },
  },
  {
    id: "speedy_gonzales",
    tier: "diamant",
    threshold: { key: "maxMs", default: 400, unit: "ms", min: 100, max: 2000 },
  },
  { id: "perfect_game", tier: "diamant" },
] as const satisfies RegistryEntry[]

export type AchievementId = (typeof ACHIEVEMENTS_REGISTRY)[number]["id"]

export interface MergedAchievement {
  id: AchievementId
  tier: AchievementTier
  enabled: boolean
  name: string | null
  description: string | null
  threshold: number | null
  // Bonus points awarded to a player when this badge is unlocked. Resolves to 0
  // when the config carries no per-id override (the registry holds no per-badge
  // bonus), so the SHIPPED scoring stays byte-identical until a manager sets it.
  bonus: number
}

// Upper clamp for the per-badge bonus points (mirrors the threshold clamp).
export const BONUS_MAX = 5000

// Suggested per-tier default bonus, surfaced ONLY in the manager UI as a seed
// value. The merge below deliberately does NOT use this — an unset bonus always
// resolves to 0 so existing server scoring tests stay green.
export const TIER_BONUS_DEFAULT: Record<AchievementTier, number> = {
  bronze: 50,
  silver: 100,
  gold: 200,
  diamant: 400,
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function mergeAchievementsConfig(
  raw:
    | Record<
        string,
        {
          enabled?: boolean
          name?: string
          description?: string
          threshold?: number
          bonus?: number
        }
      >
    | undefined,
): MergedAchievement[] {
  return ACHIEVEMENTS_REGISTRY.map((entry) => {
    const override = raw?.[entry.id]
    const thresholdDef = "threshold" in entry ? entry.threshold : undefined
    return {
      id: entry.id,
      tier: entry.tier,
      enabled: override?.enabled ?? true,
      name: override?.name ?? null,
      description: override?.description ?? null,
      threshold: thresholdDef
        ? clamp(
            override?.threshold ?? thresholdDef.default,
            thresholdDef.min,
            thresholdDef.max,
          )
        : null,
      // Registry carries no per-id bonus → resolves to 0 when unset. Clamped to
      // [0, BONUS_MAX]. Tier defaults are a UI suggestion only (see above).
      bonus: clamp(override?.bonus ?? 0, 0, BONUS_MAX),
    }
  })
}
