import { create } from "zustand"

// Global mute toggle for all in-game sound. Persisted to localStorage so the
// player's preference survives reloads. Kept as a plain zustand store (mirrors
// the other game stores) with a tiny manual localStorage read/write rather than
// pulling in the persist middleware for a single boolean.
const LS_KEY = "rahoot_muted"

function readMuted(): boolean {
  try {
    return localStorage.getItem(LS_KEY) === "true"
  } catch {
    return false
  }
}

function writeMuted(muted: boolean): void {
  try {
    localStorage.setItem(LS_KEY, muted ? "true" : "false")
  } catch {
    // localStorage unavailable — silently skip
  }
}

interface SoundStore {
  muted: boolean
  toggle: () => void
}

export const useSoundStore = create<SoundStore>((set) => ({
  muted: readMuted(),
  toggle: () =>
    set((state) => {
      const muted = !state.muted
      writeMuted(muted)
      return { muted }
    }),
}))
