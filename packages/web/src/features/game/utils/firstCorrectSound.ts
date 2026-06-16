// "We are the champions" sting for the first player to answer correctly.
// Self-hosted at /theme/firstcorrect.mp3 (config volume, served by nginx).
// Uses the native Audio API (no extra dep) and preloads on game start so it
// plays instantly when the result arrives.
import { useSoundStore } from "@razzoozle/web/features/game/stores/sound"

let audio: HTMLAudioElement | null = null
// The chime asset is optional and may 404. Track load failure so we can skip
// playback silently instead of letting the browser surface an uncaught error.
let loadFailed = false

export const preloadFirstCorrectSound = () => {
  if (!audio) {
    audio = new Audio("/theme/firstcorrect.mp3")
    audio.preload = "auto"
    audio.volume = 0.6
    // Swallow load/404 errors: the chime is optional, no console spam.
    audio.addEventListener("error", () => {
      loadFailed = true
    })
    audio.load()
  }
}

export const playFirstCorrectSound = () => {
  // Respect the global mute toggle. Read straight from the store (this is a
  // plain module fn, not a hook) so it stays in sync with the useSound calls.
  if (useSoundStore.getState().muted) {
    return
  }

  preloadFirstCorrectSound()

  if (audio && !loadFailed) {
    audio.currentTime = 0
    void audio.play().catch(() => {
      // Ignore autoplay rejection and missing-asset (404) rejections — the
      // chime is optional and must degrade silently.
    })
  }
}
