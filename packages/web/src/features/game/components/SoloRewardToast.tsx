/**
 * SoloRewardToast — top-center achievement toast for solo play, stacked just
 * below ScoreToast. Like ScoreToast, it portals to document.body so the
 * `position: fixed` slot attaches to the VIEWPORT, not to SoloShell's
 * transformed/overflow-hidden wrapper (which would otherwise clip it). This
 * puts the unlocked achievement(s) in the same place as the points card,
 * reusing the shared RewardStack card vocabulary.
 */
import RewardStack from "@razzoozle/web/features/game/components/RewardStack"
import { createPortal } from "react-dom"

interface Props {
  achievementIds: string[]
  /** = resultReady (phase === "result" && lastResult !== null). */
  visible: boolean
}

const SoloRewardToast = ({ achievementIds, visible }: Props) => {
  if (typeof document === "undefined") return null
  if (achievementIds.length === 0) return null

  return createPortal(
    <div
      className="pointer-events-none fixed left-1/2 z-[59] w-[min(92vw,24rem)] -translate-x-1/2"
      style={{ top: "calc(max(1.5rem, env(safe-area-inset-top)) + 5rem)" }}
    >
      <RewardStack achievementIds={achievementIds} visible={visible} tone="toast" />
    </div>,
    document.body,
  )
}

export default SoloRewardToast
