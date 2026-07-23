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

// canvas-confetti is dynamic-imported (instead of statically) so it lands in its
// own lazy chunk rather than the eager bundle — it is only needed during a
// celebration, never on first render. Callers fire-and-forget (`void`), so the
// async indirection is invisible to them.
const loadConfetti = () => import("canvas-confetti").then((m) => m.default)

/** Safe under Toolbar z-10 / Chrome z-50 so confetti never blocks chrome UI. */
const CONFETTI_Z_INDEX = 40

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
 * Build a worker-backed confetti fire fn. Passing a falsy canvas lets the
 * library manage a full-window canvas (isLibCanvas); types require an element
 * so we cast null. zIndex is applied per call-site options.
 */
async function createWorkerConfetti() {
  const confetti = await loadConfetti()
  // Library accepts null → auto-managed canvas; types only list HTMLCanvasElement.
  return confetti.create(null as unknown as HTMLCanvasElement, {
    useWorker: true,
  })
}

/**
 * Fire a confetti burst scaled to the highest unlocked achievement tier.
 * Two-sided stream for the diamant tier.
 */
export async function fireTierConfetti(
  achievementIds: string[],
  reduced: boolean,
): Promise<void> {
  if (shouldSkipBurst(reduced) || achievementIds.length === 0) return

  const tiers = achievementIds
    .map((id) => ACHIEVEMENT_META[id]?.tier)
    .filter((t): t is NonNullable<typeof t> => t !== undefined)

  const top = highestTier(tiers)
  if (!top) return

  const colors = TIER_COLORS[top] ?? []
  const fire = await createWorkerConfetti()

  if (top === "diamant") {
    // Two-sided stream
    const baseOpts = {
      particleCount: 80,
      spread: 70,
      startVelocity: 55,
      ticks: 200,
      colors,
      zIndex: CONFETTI_Z_INDEX,
      disableForReducedMotion: true,
    }
    void fire({ ...baseOpts, origin: { x: 0, y: 0.6 }, angle: 60 })
    void fire({ ...baseOpts, origin: { x: 1, y: 0.6 }, angle: 120 })
  } else {
    void fire({
      particleCount: 60,
      spread: 60,
      origin: { x: 0.5, y: 0.65 },
      colors,
      ticks: 160,
      zIndex: CONFETTI_Z_INDEX,
      disableForReducedMotion: true,
    })
  }
}

/**
 * Fire a generic center burst — used for a correct answer in solo mode where
 * there is no achievement tier to key off of.
 */
export async function fireCenterSalvo(reduced: boolean): Promise<void> {
  if (shouldSkipBurst(reduced)) return

  const fire = await createWorkerConfetti()
  void fire({
    particleCount: 45,
    spread: 70,
    origin: { x: 0.5, y: 0.6 },
    zIndex: CONFETTI_Z_INDEX,
    disableForReducedMotion: true,
  })
}
