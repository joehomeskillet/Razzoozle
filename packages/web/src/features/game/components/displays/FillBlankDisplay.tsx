import { motion } from "motion/react"
import { useTranslation } from "react-i18next"
import { useReveal } from "@razzoozle/web/features/game/animation/presets"

interface Props {
  correctOptions?: string[]
}

export const FillBlankDisplay = ({
  correctOptions,
}: Props) => {
  const { t } = useTranslation()
  const reveal = useReveal()

  if (!correctOptions?.length) {
    return null
  }

  return (
    <motion.div
      className="w-full rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-white p-4 text-center shadow-[var(--shadow-flat)]"
      variants={reveal.item()}
      transition={reveal.spring}
    >
      <p className="mb-2 text-sm font-semibold text-[color:var(--game-fg)]">
        {t("game:fillBlank.correctAnswers")}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {correctOptions.map((option, i) => (
          <span
            key={`${option}-${i}`}
            className="text-answer-text inline-flex items-center rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--state-correct)] px-3 py-2 text-lg font-bold md:text-xl lg:text-[clamp(1.25rem,3vh,2.5rem)]"
          >
            {option}
          </span>
        ))}
      </div>
    </motion.div>
  )
}
