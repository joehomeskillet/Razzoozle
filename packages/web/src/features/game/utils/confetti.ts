/**
 * Shared confetti helpers.
 *
 * Lifted out of Result.tsx so both the host result screen (tier-based) and the
 * solo play mode (generic center salvo on a correct answer) can reuse them.
 * Both helpers early-return when the user prefers reduced motion — callers
 * (Result / Podium) pass their `useReducedMotion()` value (or `reveal.reduced`)
 * straight through, so a reduced-motion user always gets a silent no-op burst.
 */
import {
  ACHIEVEMENT_META,
  highestTier,
} from "@razzoozle/web/features/game/utils/achievements"
import confetti from "canvas-confetti"

/**
 * Per-tier burst parameters. Centralised so every tier funnels through one
 * `confetti()` call path — diamant being the only tier that fires a two-sided
 * stream rather than a single center salvo.
 */
const TIER_COLORS: Record<string, string[]> = {
  bronze: ["#d97706", "#f59e0b", "#fcd34d"],
  silver: ["#94a3b8", "#cbd5e1", "#e2e8f0"],
  gold: ["#eab308", "#facc15", "#fef08a"],
  diamant: ["#22d3ee", "#a855f7", "#ec4899", "#f0f", "#0ff"],
}

/**
 * Reduced-motion / no-op guard. Returns `true` when no confetti should fire so
 * callers and helpers share one early-return path. Accepting a plain boolean
 * keeps this a framework-free `.ts` util (no React hooks here).
 */
function shouldSkipBurst(reduced: boolean): boolean {
  return reduced
}

/**
 * Fire a confetti burst scaled to the highest unlocked achievement tier.
 * Two-sided stream for the diamant tier.
 */
export function fireTierConfetti(
  achievementIds: string[],
  reduced: boolean,
): void {
  if (shouldSkipBurst(reduced) || achievementIds.length === 0) return

  const tiers = achievementIds
    .map((id) => ACHIEVEMENT_META[id]?.tier)
    .filter((t): t is NonNullable<typeof t> => t !== undefined)

  const top = highestTier(tiers)
  if (!top) return

  const colors = TIER_COLORS[top] ?? []

  if (top === "diamant") {
    // Two-sided stream
    const baseOpts = {
      particleCount: 80,
      spread: 70,
      startVelocity: 55,
      ticks: 200,
      colors,
    }
    void confetti({ ...baseOpts, origin: { x: 0, y: 0.6 }, angle: 60 })
    void confetti({ ...baseOpts, origin: { x: 1, y: 0.6 }, angle: 120 })
  } else {
    void confetti({
      particleCount: 60,
      spread: 60,
      origin: { x: 0.5, y: 0.65 },
      colors,
      ticks: 160,
    })
  }
}

/**
 * Fire a generic center burst — used for a correct answer in solo mode where
 * there is no achievement tier to key off of.
 */
export function fireCenterSalvo(reduced: boolean): void {
  if (shouldSkipBurst(reduced)) return

  void confetti({
    particleCount: 45,
    spread: 70,
    origin: { x: 0.5, y: 0.6 },
  })
}
