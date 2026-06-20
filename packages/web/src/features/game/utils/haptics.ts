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

// iOS haptic fallback using switch-click trick for Safari with no Vibration API
const iosHapticTick = () => {
  try {
    const label = document.createElement("label")
    label.setAttribute("aria-hidden", "true")
    label.style.display = "none"
    const input = document.createElement("input")
    input.type = "checkbox"
    input.setAttribute("switch", "")
    label.appendChild(input)
    document.head.appendChild(label)
    label.click()
    document.head.removeChild(label)
  } catch {
    /* ignore */
  }
}

// Fallback for iOS Safari when navigator.vibrate is unavailable
const fireWithIosFallback = (pattern: number | number[]) => {
  if (!canVibrate()) return

  // Primary path: navigator.vibrate (Android/desktop)
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(pattern)
    } catch {
      /* ignore */
    }
    return
  }

  // iOS Safari fallback: use switch-click trick if on coarse pointer (touch) device
  if (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches) {
    const pulses = Array.isArray(pattern) ? pattern : [pattern]
    // Count non-zero elements as haptic ticks (skip pause durations)
    let tickCount = 0
    for (let i = 0; i < pulses.length; i += 2) {
      if (pulses[i] > 0) tickCount++
    }
    // Space ticks ~120ms apart
    for (let i = 0; i < tickCount; i++) {
      setTimeout(iosHapticTick, i * 120)
    }
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

export const hapticTap = () => fireWithIosFallback(25) // answer tap / coin
export const hapticSuccess = () => fireWithIosFallback([45]) // correct
export const hapticError = () => fireWithIosFallback([140, 50, 140]) // wrong (stutter rumble)
export const hapticWin = () => fireWithIosFallback([70, 40, 70, 40, 160]) // first-correct / podium
export const hapticCountdown = () => fireWithIosFallback(40) // per tick (last 3s only)
export const hapticAchievement = (
  tier: "bronze" | "silver" | "gold" | "diamant",
) =>
  fireWithIosFallback(
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
