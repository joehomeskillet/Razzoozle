// Experience feedback service — maps high-level cues to audio + haptic feedback.
// Reads preferences directly from stores (no hooks, works in imperative contexts).
// Handles deduplication with a short time window to prevent feedback storms.

import { type ExperienceFeedbackCue } from "@razzoozle/common/experience-kit/feedbackCue"
import { SOUND_DEFAULTS, type SoundSlot } from "@razzoozle/common/constants"
import { useSoundStore } from "@razzoozle/web/features/game/stores/sound"
import {
  hapticTap,
  hapticSuccess,
  hapticError,
  hapticWin,
  hapticCountdown,
  hapticAchievement,
} from "@razzoozle/web/features/game/utils/haptics"
import { useThemeStore } from "@razzoozle/web/features/theme/store"

// Cue-to-{SoundSlot, HapticFn} mapping. Cues without dedicated sound slots use
// generic placeholders (show, boump) — these are known gaps in SOUND_SLOTS and
// should be replaced when new slots are added to the theme system.
const CUE_MAP: Record<
  ExperienceFeedbackCue,
  {
    soundSlot: SoundSlot
    haptic: () => void
  }
> = {
  "progress-small": {
    soundSlot: "answersSound",
    haptic: hapticTap,
  },
  "progress-large": {
    soundSlot: "show",
    haptic: hapticSuccess,
  },
  "negative-small": {
    soundSlot: "boump",
    haptic: hapticError,
  },
  "negative-large": {
    soundSlot: "boump",
    haptic: hapticError,
  },
  "powerup-ready": {
    soundSlot: "show", // placeholder: no dedicated powerup-ready slot
    haptic: hapticCountdown,
  },
  "powerup-activate": {
    soundSlot: "boump", // placeholder: no dedicated powerup-activate slot
    haptic: hapticSuccess,
  },
  "shield-block": {
    soundSlot: "boump", // placeholder: no dedicated shield-block slot
    haptic: hapticTap,
  },
  "phase-complete": {
    soundSlot: "results",
    haptic: hapticSuccess,
  },
  achievement: {
    soundSlot: "tierGold",
    haptic: () => hapticAchievement("gold"),
  },
  "game-win": {
    soundSlot: "podiumFirst",
    haptic: hapticWin,
  },
  "game-loss": {
    soundSlot: "boump",
    haptic: hapticError,
  },
}

// Deduplication window (ms): same cue fired within this window is skipped.
// Prevents feedback storms from rapid state changes.
const DEDUP_WINDOW_MS = 150

// In-module dedup map: Map<cue, lastFireTimeMs>
const lastFiredTime = new Map<ExperienceFeedbackCue, number>()

// Cached Audio objects keyed by slot, preloaded on first use.
const audioCache = new Map<SoundSlot, HTMLAudioElement | null>()

export interface FireFeedbackOptions {
  // Force bypass deduplication for this cue (useful for guaranteed feedback).
  bypassDedup?: boolean
}

export const fireFeedback = (cue: ExperienceFeedbackCue, opts?: FireFeedbackOptions) => {
  // Unknown cue: silently ignore instead of crashing.
  if (!(cue in CUE_MAP)) {
    return
  }

  // Deduplication: skip if same cue fired recently (unless bypassDedup).
  if (!opts?.bypassDedup) {
    const now = performance.now()
    const last = lastFiredTime.get(cue) ?? 0
    if (now - last < DEDUP_WINDOW_MS) {
      return
    }
    lastFiredTime.set(cue, now)
  }

  const { soundSlot, haptic } = CUE_MAP[cue]

  // Fire audio (if not muted).
  playAudio(soundSlot)

  // Fire haptic (independently gated by haptics-enabled toggle).
  haptic()
}

// Play audio from the sound slot. Falls back to SOUND_DEFAULTS if theme override
// is absent or null. Respects the global mute toggle.
const playAudio = (slot: SoundSlot) => {
  if (useSoundStore.getState().muted) {
    return
  }

  // Fetch URL from theme or defaults.
  const theme = useThemeStore.getState().theme
  const url = theme.sounds?.[slot] ?? SOUND_DEFAULTS[slot]

  if (!url) {
    return
  }

  // Reuse cached Audio if available; create + cache on first use.
  let audio = audioCache.get(slot)
  if (!audio) {
    audio = new Audio(url)
    audio.volume = 0.6
    audio.addEventListener("error", () => {
      // Load failure: mark as null so we don't retry repeatedly.
      audioCache.set(slot, null)
    })
    audio.load()
    audioCache.set(slot, audio)
  }

  // Skip playback if load failed (null in cache).
  if (!audio) {
    return
  }

  // Play: reset time and fire, swallowing autoplay + 404 rejections.
  audio.currentTime = 0
  void audio.play().catch(() => {
    // Ignore: asset may 404, browser may block autoplay, etc.
  })
}

// Exported for testing: clear all dedup and audio state.
export const __clearCache__ = () => {
  lastFiredTime.clear()
  audioCache.clear()
}
