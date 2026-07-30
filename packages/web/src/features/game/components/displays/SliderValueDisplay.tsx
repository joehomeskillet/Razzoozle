import { motion } from "motion/react"
import { useTranslation } from "react-i18next"
import { useReveal } from "@razzoozle/web/features/game/animation/presets"

interface Props {
  correct: number | string
  unit?: string
  averageGuess?: number | null
}

export const SliderValueDisplay = ({
  correct,
  unit,
  averageGuess,
}: Props) => {
  const { t } = useTranslation()
  const reveal = useReveal()

  return (
    <motion.div
      className="flex flex-col items-center gap-3"
      variants={reveal.container()}
      initial="hidden"
      animate="visible"
    >
      <motion.div
        variants={reveal.item()}
        transition={reveal.spring}
        className="text-lg font-semibold text-[color:var(--game-fg)]/70 lg:text-[clamp(1.25rem,3vh,2.5rem)]"
      >
        {t("game:slider.correctAnswer")}
      </motion.div>
      <motion.div
        variants={reveal.item()}
        transition={reveal.spring}
        className="text-6xl font-bold text-[color:var(--game-fg)] drop-shadow-lg lg:text-[clamp(4rem,10vh,10rem)]"
      >
        {correct}
        {unit ? ` ${unit}` : ""}
      </motion.div>
      {averageGuess != null && (
        <motion.div
          variants={reveal.item()}
          transition={reveal.spring}
          className="text-xl font-semibold text-[color:var(--game-fg)]/80 lg:text-[clamp(1.25rem,3vh,2.5rem)]"
        >
          {t("game:slider.averageGuess", { value: averageGuess })}
          {unit ? ` ${unit}` : ""}
        </motion.div>
      )}
    </motion.div>
  )
}
