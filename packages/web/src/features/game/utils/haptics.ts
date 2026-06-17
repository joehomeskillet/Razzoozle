// Haptics primitives — module-level fns that read the haptics store directly
// (mirrors firstCorrectSound.ts) so they work in tight tap handlers without
// hooks. Each fires navigator.vibrate with a fixed pattern, guarded by the
// player's toggle and prefers-reduced-motion. No-op when unsupported.
import { useHapticsStore } from "@razzoozle/web/features/game/stores/haptics"

const reduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

const canVibrate = () =>
  typeof navigator !== "undefined" &&
  "vibrate" in navigator &&
  useHapticsStore.getState().enabled &&
  !reduced()

const fire = (pattern: number | number[]) => {
  if (canVibrate()) navigator.vibrate(pattern)
}

export const hapticTap = () => fire(25) // answer tap / coin
export const hapticSuccess = () => fire([45]) // correct
export const hapticError = () => fire([140, 50, 140]) // wrong (stutter rumble)
export const hapticWin = () => fire([70, 40, 70, 40, 160]) // first-correct / podium
export const hapticCountdown = () => fire(40) // per tick (last 3s only)
export const hapticAchievement = (
  tier: "bronze" | "silver" | "gold" | "diamant",
) =>
  fire(
    { bronze: [40], silver: [40, 30, 40], gold: [60, 40, 60], diamant: [90, 40, 90, 40, 140] }[
      tier
    ] ?? [45],
  )
