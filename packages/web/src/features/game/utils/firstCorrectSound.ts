// "We are the champions" sting for the first player to answer correctly.
// Self-hosted at /theme/firstcorrect.mp3 (config volume, served by nginx).
// Uses the native Audio API (no extra dep) and preloads on game start so it
// plays instantly when the result arrives.
let audio: HTMLAudioElement | null = null

export const preloadFirstCorrectSound = () => {
  if (!audio) {
    audio = new Audio("/theme/firstcorrect.mp3")
    audio.preload = "auto"
    audio.volume = 0.6
    audio.load()
  }
}

export const playFirstCorrectSound = () => {
  preloadFirstCorrectSound()
  if (audio) {
    audio.currentTime = 0
    void audio.play().catch(() => {
      // ignore autoplay rejection (player has already interacted in-game)
    })
  }
}
