import type { CommonStatusDataMap } from "@razzoozle/common/types/game/status"
import { useReveal } from "@razzoozle/web/features/game/animation/presets"
import {
  answerColor,
  answerLabel,
} from "@razzoozle/web/features/game/utils/answers"
import clsx from "clsx"
import { motion } from "motion/react"
import { useTranslation } from "react-i18next"

interface Props {
  data: CommonStatusDataMap["SHOW_PREPARED"]
}

const Prepared = ({ data: { totalAnswers, questionNumber } }: Props) => {
  const { t } = useTranslation()
  const reveal = useReveal()

  return (
    <motion.section
      className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center"
      variants={reveal.container()}
      initial="hidden"
      animate="visible"
    >
      <motion.h2
        className="mb-20 text-center text-3xl font-bold text-[color:var(--game-fg)] md:text-4xl lg:text-5xl"
        variants={reveal.item()}
        transition={reveal.spring}
      >
        {t("game:questionPrefix")}
        {questionNumber}
      </motion.h2>
      {totalAnswers > 0 ? (
        <motion.div
          className="grid aspect-square w-60 grid-cols-2 gap-4 rounded-2xl bg-[var(--surface-muted)] p-5 md:w-60"
          variants={reveal.pop(0.92)}
          transition={reveal.spring}
        >
          {Array.from({ length: totalAnswers }).map((_, key) => (
            <div
              key={key}
              className={clsx(
                "button shadow-inset flex aspect-square h-full w-full items-center justify-center rounded-2xl",
                answerColor(key),
              )}
            >
              <span className="text-2xl font-bold text-[var(--answer-text)] md:text-3xl">
                {answerLabel(key)}
              </span>
            </div>
          ))}
        </motion.div>
      ) : (
        <motion.div
          aria-hidden="true"
          variants={reveal.pop(0.92)}
          transition={reveal.spring}
          className="flex aspect-[5/2] w-60 items-center rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-white px-6 shadow-[var(--shadow-flat)]"
        >
          <div className="relative h-2 w-full rounded-full bg-[color:var(--surface-muted)]/25">
            <span className="absolute top-1/2 left-1/2 size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--border-hairline)] bg-[var(--color-accent)] shadow-[var(--shadow-flat)]" />
          </div>
        </motion.div>
      )}
    </motion.section>
  )
}

export default Prepared
