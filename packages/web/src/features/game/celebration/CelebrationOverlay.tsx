/**
 * CelebrationOverlay — single entry point for the post-game celebration layer.
 *
 * Composes the winner podium, the achievement burst queue, and the one-shot
 * winner confetti. Fire-and-forget on mount; the root is `pointer-events-none`
 * so it never blocks the host screen's share buttons. Reduced motion still
 * renders podium + badges statically (children handle the guard) and fires no
 * confetti.
 *
 * Presentation/orchestration only — no socket, store, or network imports.
 */

import { useReveal } from "@razzoozle/web/features/game/animation/presets"
import { useEffect, useRef } from "react"

import AchievementBurst from "./AchievementBurst"
import { fireWinnerConfetti } from "./confetti"
import type { CelebrationOverlayProps } from "./types"
import WinnerPodium from "./WinnerPodium"

const CelebrationOverlay = (props: CelebrationOverlayProps) => {
  const { data, renderPodium = true, fireConfetti = true, onComplete } = props
  const reveal = useReveal()

  const newAchievements = data.newAchievements ?? []

  // One-shot confetti on mount, guarded against React 18 StrictMode double-invoke.
  const firedRef = useRef(false)
  useEffect(() => {
    if (firedRef.current) return
    firedRef.current = true
    if (fireConfetti && !reveal.reduced) {
      void fireWinnerConfetti(reveal.reduced)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // When there are no badges, the burst never fires onComplete — resolve here so
  // the sequence always completes exactly once.
  const completedRef = useRef(false)
  useEffect(() => {
    if (newAchievements.length > 0) return
    if (completedRef.current) return
    completedRef.current = true
    onComplete?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="pointer-events-none">
      {renderPodium && <WinnerPodium top={data.podium} />}

      <div className="pointer-events-none absolute inset-0 flex items-start justify-center">
        <AchievementBurst
          ids={newAchievements}
          onComplete={newAchievements.length > 0 ? onComplete : undefined}
        />
      </div>
    </div>
  )
}

export default CelebrationOverlay
