import { useEffect } from "react"
import { useSoloStore } from "@razzoozle/web/features/game/stores/solo"

// ---------------------------------------------------------------------------
// Helper: auto-advance from "question" phase to "answering" after cooldown
// ---------------------------------------------------------------------------

interface SoloAutoAdvanceProps {
  cooldown: number
}

export const SoloAutoAdvance = ({ cooldown }: SoloAutoAdvanceProps) => {
  useEffect(() => {
    // Transition from "question" display to "answering" (showing answer buttons)
    // after the cooldown animation finishes.
    const id = setTimeout(() => {
      useSoloStore.setState({ phase: "answering" })
    }, cooldown * 1000)

    return () => clearTimeout(id)
    // oxlint-disable-next-line
  }, [cooldown])

  return null
}

// ---------------------------------------------------------------------------
// Helper: auto-advance from "result" phase to the next question / finished
// ---------------------------------------------------------------------------

const AUTO_NEXT_MS = 5000

export const SoloResultAutoAdvance = () => {
  useEffect(() => {
    // Advance to the next question (or the finished screen on the last one)
    // after a short linger on the result. Unmounting (toggle off / phase
    // change / manual Next) clears the pending timeout.
    const id = setTimeout(() => {
      useSoloStore.getState().nextQuestion()
    }, AUTO_NEXT_MS)

    return () => clearTimeout(id)
  }, [])

  return null
}
