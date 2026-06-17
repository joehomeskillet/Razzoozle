import { create } from "zustand"

// Global haptics toggle for player-phone vibration feedback. Persisted to
// localStorage so the player's preference survives reloads. Mirrors the sound
// store: a plain zustand store with a tiny manual localStorage read/write
// rather than the persist middleware for a single boolean.
//
// Default ON: an absent key means haptics are enabled, so we only treat the
// explicit string "false" as off.
const LS_KEY = "rahoot_haptics"

function readEnabled(): boolean {
  try {
    return localStorage.getItem(LS_KEY) !== "false"
  } catch {
    return true
  }
}

function writeEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(LS_KEY, enabled ? "true" : "false")
  } catch {
    // localStorage unavailable — silently skip
  }
}

interface HapticsStore {
  enabled: boolean
  toggle: () => void
}

export const useHapticsStore = create<HapticsStore>((set) => ({
  enabled: readEnabled(),
  toggle: () =>
    set((state) => {
      const enabled = !state.enabled
      writeEnabled(enabled)
      return { enabled }
    }),
}))
