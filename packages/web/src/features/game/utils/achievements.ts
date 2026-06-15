/**
 * Achievement metadata — single source of truth for client-side display.
 * IDs must match the server's achievement catalog exactly.
 */

import type { MergedAchievement } from "@razzia/common/achievements"

export type AchievementTier = "bronze" | "silver" | "gold" | "diamant"

export interface AchievementMeta {
  id: string
  tier: AchievementTier
  /** i18n key within the "game:achievements" namespace */
  i18nKey: string
  icon: string
}

// ─── Catalog ─────────────────────────────────────────────────────────────────

export const ACHIEVEMENT_META: Record<string, AchievementMeta> = {
  // Bronze
  first_correct: {
    id: "first_correct",
    tier: "bronze",
    i18nKey: "game:achievements.first_correct",
    icon: "✅",
  },
  participation: {
    id: "participation",
    tier: "bronze",
    i18nKey: "game:achievements.participation",
    icon: "🎟️",
  },
  lucky_guess: {
    id: "lucky_guess",
    tier: "bronze",
    i18nKey: "game:achievements.lucky_guess",
    icon: "🍀",
  },

  // Silver
  speed_demon: {
    id: "speed_demon",
    tier: "silver",
    i18nKey: "game:achievements.speed_demon",
    icon: "⚡",
  },
  streak_3: {
    id: "streak_3",
    tier: "silver",
    i18nKey: "game:achievements.streak_3",
    icon: "🔥",
  },
  sharpshooter: {
    id: "sharpshooter",
    tier: "silver",
    i18nKey: "game:achievements.sharpshooter",
    icon: "🎯",
  },
  climber: {
    id: "climber",
    tier: "silver",
    i18nKey: "game:achievements.climber",
    icon: "🧗",
  },

  // Gold
  first_responder: {
    id: "first_responder",
    tier: "gold",
    i18nKey: "game:achievements.first_responder",
    icon: "🥇",
  },
  streak_5: {
    id: "streak_5",
    tier: "gold",
    i18nKey: "game:achievements.streak_5",
    icon: "🔥",
  },
  underdog: {
    id: "underdog",
    tier: "gold",
    i18nKey: "game:achievements.underdog",
    icon: "🐢",
  },
  perfect_round: {
    id: "perfect_round",
    tier: "gold",
    i18nKey: "game:achievements.perfect_round",
    icon: "💯",
  },

  // Diamant
  streak_10: {
    id: "streak_10",
    tier: "diamant",
    i18nKey: "game:achievements.streak_10",
    icon: "🔥",
  },
  speedy_gonzales: {
    id: "speedy_gonzales",
    tier: "diamant",
    i18nKey: "game:achievements.speedy_gonzales",
    icon: "💨",
  },
  perfect_game: {
    id: "perfect_game",
    tier: "diamant",
    i18nKey: "game:achievements.perfect_game",
    icon: "👑",
  },
}

// ─── Tier order (ascending) ───────────────────────────────────────────────────

const TIER_ORDER: AchievementTier[] = ["bronze", "silver", "gold", "diamant"]

export const TIER_INDEX: Record<AchievementTier, number> = {
  bronze: 0,
  silver: 1,
  gold: 2,
  diamant: 3,
}

/** Returns the highest tier from a list, or null if empty. */
export function highestTier(
  tiers: AchievementTier[],
): AchievementTier | null {
  if (tiers.length === 0) return null
  return tiers.reduce((best, t) =>
    TIER_INDEX[t] > TIER_INDEX[best] ? t : best,
  )
}

// ─── Tier visual tokens ───────────────────────────────────────────────────────

export interface TierStyle {
  /** Tailwind gradient classes for badge background */
  gradient: string
  /** Text color for badge label */
  textColor: string
  /** Border/ring color */
  ringColor: string
  /** Label (display name key, also used as fallback) */
  label: string
}

export const TIER_STYLES: Record<AchievementTier, TierStyle> = {
  bronze: {
    gradient: "from-amber-600 to-orange-700",
    textColor: "text-white",
    ringColor: "ring-amber-400",
    label: "Bronze",
  },
  silver: {
    gradient: "from-slate-300 to-slate-500",
    textColor: "text-slate-900",
    ringColor: "ring-slate-200",
    label: "Silber",
  },
  gold: {
    gradient: "from-yellow-400 to-amber-500",
    textColor: "text-white",
    ringColor: "ring-yellow-300",
    label: "Gold",
  },
  diamant: {
    gradient: "from-cyan-400 via-fuchsia-500 to-violet-500",
    textColor: "text-white",
    ringColor: "ring-cyan-200",
    label: "Diamant",
  },
}

// ─── Flat tier token exports (canonical, spec-aligned) ────────────────────────
// Derived from TIER_STYLES — single source of truth, no duplication.

/** Tailwind gradient background classes keyed by tier. */
export const TIER_GRADIENT: Record<AchievementTier, string> = {
  bronze: TIER_STYLES.bronze.gradient,
  silver: TIER_STYLES.silver.gradient,
  gold: TIER_STYLES.gold.gradient,
  diamant: TIER_STYLES.diamant.gradient,
}

/** Tailwind ring color class keyed by tier. */
export const TIER_RING: Record<AchievementTier, string> = {
  bronze: TIER_STYLES.bronze.ringColor,
  silver: TIER_STYLES.silver.ringColor,
  gold: TIER_STYLES.gold.ringColor,
  diamant: TIER_STYLES.diamant.ringColor,
}

/** Readable text color class on that tier's gradient background. */
export const TIER_TEXT: Record<AchievementTier, string> = {
  bronze: TIER_STYLES.bronze.textColor,
  silver: TIER_STYLES.silver.textColor,
  gold: TIER_STYLES.gold.textColor,
  diamant: TIER_STYLES.diamant.textColor,
}

/** Human-readable tier label (German). */
export const TIER_LABEL: Record<AchievementTier, string> = {
  bronze: TIER_STYLES.bronze.label,
  silver: TIER_STYLES.silver.label,
  gold: TIER_STYLES.gold.label,
  diamant: TIER_STYLES.diamant.label,
}

export { TIER_ORDER }

// ─── Server-merged achievement meta (with manager overrides) ──────────────────

/** Module-level promise cache so the fetch fires at most once per page load. */
let _mergedMetaPromise: Promise<MergedAchievement[]> | null = null

/**
 * Fetches the merged achievement list from the server (`GET /api/achievements`).
 * Results are cached for the lifetime of the page — call freely.
 * Falls back to an empty list on any error so callers can safely fall back to
 * the static ACHIEVEMENT_META + i18n.
 */
export function loadAchievementMeta(): Promise<MergedAchievement[]> {
  if (_mergedMetaPromise) return _mergedMetaPromise

  _mergedMetaPromise = fetch("/api/achievements", {
    headers: { Accept: "application/json" },
  })
    .then((res) => {
      if (!res.ok) throw new Error(`/api/achievements returned ${res.status}`)
      return res.json() as Promise<{ achievements: MergedAchievement[] }>
    })
    .then((body) => body.achievements ?? [])
    .catch(() => {
      // Reset so the next call can retry (e.g. if network was temporarily down).
      _mergedMetaPromise = null
      return []
    })

  return _mergedMetaPromise
}

export interface AchievementDisplay {
  name: string
  description: string
}

/**
 * Returns the display name and description for an achievement id.
 * Prefers the server-provided override (`merged.name` / `merged.description`);
 * falls back to the i18n-resolved values supplied via `i18nFallback`.
 */
export function getAchievementDisplay(
  _id: string,
  merged: MergedAchievement | undefined,
  i18nFallback: { name: string; desc: string },
): AchievementDisplay {
  return {
    name: merged?.name ?? i18nFallback.name,
    description: merged?.description ?? i18nFallback.desc,
  }
}
