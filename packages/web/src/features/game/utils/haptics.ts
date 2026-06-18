// Haptics primitives — module-level fns that read the haptics store directly
// (mirrors firstCorrectSound.ts) so they work in tight tap handlers without
// hooks. Each fires navigator.vibrate with a fixed pattern, guarded by the
// player's own toggle. No-op when unsupported.
import { useHapticsStore } from "@razzoozle/web/features/game/stores/haptics"

// navigator.vibrate exists on Android Chrome/Firefox/Samsung/Edge etc. iOS
// Safari has NO Vibration API, so this is permanently false there — nothing the
// web can do about that. We deliberately do NOT gate on prefers-reduced-motion:
// haptics is tactile feedback with its own dedicated opt-in toggle, not on-screen
// motion, and coupling the two silently disabled it for reduce-motion users.
export const isHapticsSupported = (): boolean =>
  typeof navigator !== "undefined" && typeof navigator.vibrate === "function"

const visible = () =>
  typeof document === "undefined" || document.visibilityState !== "hidden"

const canVibrate = () =>
  isHapticsSupported() && visible() && useHapticsStore.getState().enabled

const fire = (pattern: number | number[]) => {
  if (!canVibrate()) return
  try {
    navigator.vibrate(pattern)
  } catch {
    // some engines throw if vibration is currently disallowed — ignore
  }
}

// Establish sticky user activation as early as possible. The Vibration API needs
// the document to have been interacted with at least once, otherwise the first
// non-tap buzz (e.g. the last-3s countdown, which can fire before any answer tap)
// is silently dropped. A one-shot vibrate(0) inside the first real user gesture
// unlocks later calls. Harmless (vibrate(0) cancels any vibration).
if (typeof window !== "undefined") {
  const prime = () => {
    window.removeEventListener("pointerdown", prime)
    window.removeEventListener("touchend", prime)
    try {
      navigator.vibrate?.(0)
    } catch {
      /* ignore */
    }
  }
  window.addEventListener("pointerdown", prime, { once: true, passive: true })
  window.addEventListener("touchend", prime, { once: true, passive: true })
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

// Confirmation buzz fired the instant the player ENABLES haptics, inside the
// toggle's click gesture. Bypasses the store enabled flag (it may not have
// flipped yet) but still respects support + visibility, so the player gets
// immediate on-device proof that vibration works.
export const hapticConfirm = () => {
  if (!isHapticsSupported() || !visible()) return
  try {
    navigator.vibrate([30, 40, 30])
  } catch {
    /* ignore */
  }
}
