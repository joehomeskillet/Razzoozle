import { motion } from "motion/react"
import { useTranslation } from "react-i18next"
import { useReveal } from "@razzoozle/web/features/game/animation/presets"

interface Props {
  correctAnswer?: string | number
}

export const MathematikWortartenDisplay = ({
  correctAnswer,
}: Props) => {
  const { t } = useTranslation()
  const reveal = useReveal()

  if (!correctAnswer) {
    return null
  }

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
        {t("game:reveal.correctAnswer")}
      </motion.div>
      <motion.div
        variants={reveal.item()}
        transition={reveal.spring}
        className="text-6xl font-bold text-[color:var(--game-fg)] drop-shadow-lg lg:text-[clamp(4rem,10vh,10rem)]"
      >
        {correctAnswer}
      </motion.div>
    </motion.div>
  )
}
