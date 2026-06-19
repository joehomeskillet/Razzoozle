/**
 * celebration/confetti.ts — winner side-cannon burst.
 *
 * Framework-free `.ts` helper. Fires a celebratory two-sided side-cannon burst
 * for the final winner screen, complementing (not replacing) the host screen's
 * react-confetti rain. canvas-confetti is dynamic-imported into its own lazy
 * chunk; callers fire-and-forget. No-op when the user prefers reduced motion.
 */
export async function fireWinnerConfetti(reduced: boolean): Promise<void> {
  if (reduced) return

  const confetti = (await import("canvas-confetti")).default
  const baseOpts = {
    particleCount: 70,
    spread: 70,
    startVelocity: 55,
    ticks: 200,
    colors: ["#eab308", "#facc15", "#fef08a"],
  }
  void confetti({ ...baseOpts, origin: { x: 0, y: 0.65 }, angle: 60 })
  void confetti({ ...baseOpts, origin: { x: 1, y: 0.65 }, angle: 120 })
}
