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

// Discrete-option types that preview as the answer-tile grid.
const TILE_TYPES = ["choice", "boolean", "multiple-select", "poll"]

const Prepared = ({ data: { totalAnswers, questionNumber, type } }: Props) => {
  const { t } = useTranslation()
  const reveal = useReveal()

  const tileGrid = (n: number) => (
    <motion.div
      className="grid aspect-square w-60 grid-cols-2 gap-4 rounded-2xl bg-[var(--surface-muted)] p-5 md:w-60"
      variants={reveal.pop(0.92)}
      transition={reveal.spring}
    >
      {Array.from({ length: Math.max(1, n) }).map((_, key) => (
        <div
          key={key}
          className={clsx(
            "button shadow-inset flex aspect-square h-full w-full items-center justify-center rounded-2xl border border-[var(--border-hairline)]",
            answerColor(key),
          )}
        >
          <span className="text-2xl font-bold text-[var(--answer-text)] md:text-3xl">
            {answerLabel(key)}
          </span>
        </div>
      ))}
    </motion.div>
  )

  const sliderMini = (
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
  )

  const textMini = (
    <motion.div
      aria-hidden="true"
      variants={reveal.pop(0.92)}
      transition={reveal.spring}
      className="flex aspect-[5/2] w-60 items-center gap-2 rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-white px-6 shadow-[var(--shadow-flat)]"
    >
      <span className="h-3 w-2/3 rounded-full bg-[color:var(--surface-muted)]/30" />
      <motion.span
        className="h-7 w-0.5 rounded bg-[var(--color-accent)]"
        animate={reveal.reduced ? undefined : { opacity: [1, 0.2, 1] }}
        transition={{ duration: 1, repeat: Infinity }}
      />
    </motion.div>
  )

  const chipsMini = (
    <motion.div
      aria-hidden="true"
      variants={reveal.pop(0.92)}
      transition={reveal.spring}
      className="flex aspect-[5/2] w-60 flex-wrap content-center items-center justify-center gap-2 rounded-2xl bg-[var(--surface-muted)] p-4"
    >
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={clsx(
            "h-6 rounded-full border border-[var(--border-hairline)] shadow-[var(--shadow-flat)]",
            i % 2 === 0 ? "w-10 bg-white" : "w-14 bg-[var(--color-accent)]",
          )}
        />
      ))}
    </motion.div>
  )

  const preview = () => {
    if (type === "slider") return sliderMini
    if (type === "type-answer") return textMini
    if (type === "sentence-builder") return chipsMini
    if (type && TILE_TYPES.includes(type))
      return tileGrid(totalAnswers > 0 ? totalAnswers : 4)
    // Fallback when type is absent (older payloads): previous behaviour.
    return totalAnswers > 0 ? tileGrid(totalAnswers) : sliderMini
  }

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
      {preview()}
    </motion.section>
  )
}

export default Prepared
