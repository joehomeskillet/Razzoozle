import {
  answerColor,
  answerLabel,
} from "@razzoozle/web/features/game/utils/answers"
import { useReveal } from "@razzoozle/web/features/game/animation/presets"
import clsx from "clsx"
import { motion } from "motion/react"

interface Props {
  answers: string[]
  responses: Record<string, number>
  percentages: Record<string, string>
}

/**
 * Displays answer distribution as a bar chart with motion animation.
 * Each bar height corresponds to answer frequency percentage.
 */
export function AnswerDistributionDisplay({
  answers,
  responses,
  percentages,
}: Props) {
  const reveal = useReveal()

  return (
    <motion.div
      className={`mt-8 grid h-40 w-full max-w-3xl items-end gap-4 px-2 lg:h-[clamp(16rem,45vh,32rem)]`}
      style={{ gridTemplateColumns: `repeat(${answers.length}, 1fr)` }}
      variants={reveal.container()}
      initial="hidden"
      animate="visible"
    >
      {answers.map((_, key) => (
        <motion.div
          key={key}
          variants={reveal.item()}
          transition={reveal.spring}
          className="flex h-full flex-col justify-end gap-2"
        >
          {/* Answer letter makes each bar identifiable without relying on
              color alone (color-blind safe). */}
          <span className="text-center text-xl font-bold text-[color:var(--game-fg)] drop-shadow-md lg:text-[clamp(1.25rem,3vh,2.5rem)]">
            {answerLabel(key)}
          </span>
          <div
            className={clsx(
              "flex flex-col justify-end overflow-hidden rounded-md",
              answerColor(key),
            )}
            style={{
              height: percentages[key],
              transition: reveal.reduced
                ? undefined
                : "height 320ms cubic-bezier(0.16,1,0.3,1)",
            }}
          >
            <span className="text-color-field-ink w-full bg-[color:var(--color-field-ink)]/20 text-center text-lg font-bold tabular-nums drop-shadow-md lg:text-[clamp(1.25rem,3vh,2.5rem)]">
              {responses[key] || 0}
            </span>
          </div>
        </motion.div>
      ))}
    </motion.div>
  )
}
