import { useReveal } from "@razzoozle/web/features/game/animation/presets"
import { motion } from "motion/react"
import { useTranslation } from "react-i18next"

interface Props {
  media?: { url: string }
  correctAnswer?: string
  correctHotspotIndex?: number | null
}

/**
 * Displays the drop-pin image and correct location label.
 * Renders nothing if none of media.url, correctAnswer, or correctHotspotIndex are present.
 */
export function DropPinDisplay({
  media,
  correctAnswer,
  correctHotspotIndex,
}: Props) {
  const { t } = useTranslation()
  const reveal = useReveal()

  if (!media?.url && !correctAnswer && correctHotspotIndex == null) {
    return null
  }

  return (
    <motion.div
      className="flex w-full flex-col items-center gap-3 rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-white p-4 text-center shadow-[var(--shadow-flat)]"
      variants={reveal.item()}
      transition={reveal.spring}
    >
      {media?.url && (
        <img
          src={media.url}
          alt={t("game:dropPin.correctLocation")}
          className="max-h-[40vh] max-w-full rounded-[var(--radius-theme)] border border-[var(--border-hairline)] object-contain"
        />
      )}
      <p className="text-sm font-semibold text-[color:var(--game-fg)]">
        {t("game:dropPin.correctLocation")}
      </p>
      {correctAnswer && (
        <span className="text-answer-text inline-flex items-center rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--state-correct)] px-3 py-2 text-lg font-bold md:text-xl lg:text-[clamp(1.25rem,3vh,2.5rem)]">
          {correctAnswer}
        </span>
      )}
    </motion.div>
  )
}
