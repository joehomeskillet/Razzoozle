import { useReveal } from "@razzoozle/web/features/game/animation/presets"
import { motion } from "motion/react"
import { useTranslation } from "react-i18next"

interface Props {
  correctMatches?: string[]
}

/**
 * Displays correct matching pairs as green chips.
 * Renders nothing if correctMatches is empty or undefined.
 */
export function MatchingDisplay({ correctMatches }: Props) {
  const { t } = useTranslation()
  const reveal = useReveal()

  if (!correctMatches || correctMatches.length === 0) {
    return null
  }

  return (
    <motion.div
      className="w-full rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-white p-4 text-center shadow-[var(--shadow-flat)]"
      variants={reveal.item()}
      transition={reveal.spring}
    >
      <p className="mb-2 text-sm font-semibold text-[color:var(--game-fg)]">
        {t("game:matching.correctMatches")}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {correctMatches.map((match, i) => (
          <span
            key={`${match}-${i}`}
            className="text-answer-text inline-flex items-center rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--state-correct)] px-3 py-2 text-lg font-bold md:text-xl lg:text-[clamp(1.25rem,3vh,2.5rem)]"
          >
            {match}
          </span>
        ))}
      </div>
    </motion.div>
  )
}
