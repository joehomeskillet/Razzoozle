import Markdown from "@razzoozle/web/components/Markdown"
import AnswerButton from "@razzoozle/web/features/game/components/AnswerButton"
import { useReveal } from "@razzoozle/web/features/game/animation/presets"
import {
  ANSWERS_COLORS,
  ANSWERS_LABELS,
} from "@razzoozle/web/features/game/utils/answers"
import clsx from "clsx"
import { motion } from "motion/react"
import type { AnswerViewProps } from "./types"

/**
 * ChoiceGrid — the choice-answer tile grid (single-select, A/B/C/D shapes),
 * shared leaf for the MP and Solo answer screens.
 *
 * MP (`testIdPrefix` unset) renders NO motion elements — press feedback is
 * CSS-only, since a ~200-player room's per-tap firehose must stay cheap.
 * Solo (`testIdPrefix: "solo-"`) wraps each tile in a `motion.div` for the
 * lock-in pop + result-feedback overlay, mirroring the pre-extraction
 * SoloAnswers.tsx behaviour byte-for-byte (including its testids).
 */

// Press-feedback (tap) classes — CSS-only scale-down on :active, no layout
// springs. Byte-identical to the constant in states/Answers.tsx.
const PRESS_FEEDBACK =
  "transition-transform duration-150 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100"

interface Props extends AnswerViewProps<number | null> {
  /** Answer option texts, canonical-index aligned. */
  answers?: string[]
  /** MP-only display permutation; canonical order when absent (Solo never sets it). */
  displayOrder?: number[]
}

export default function ChoiceGrid({
  value,
  onChange,
  onSubmit,
  disabled,
  feedback,
  testIdPrefix = "",
  answers,
  displayOrder,
}: Props) {
  const isSolo = testIdPrefix === "solo-"
  const reveal = useReveal()
  const renderOrder = displayOrder ?? answers?.map((_, i) => i) ?? []
  const isBoolean = renderOrder.length === 2

  const handleTap = (key: number) => () => {
    onChange(key)
    onSubmit()
  }

  return (
    <div className="mx-auto mb-4 grid w-full max-w-7xl grid-cols-2 gap-[var(--game-space-2)] px-2 text-lg font-bold md:gap-[var(--game-space-3)] md:text-xl lg:max-w-[85vw] lg:text-[clamp(1.25rem,3vh,2.5rem)]">
      {renderOrder.map((key, index) => {
        const answer = answers?.[key]
        const isPicked = value === key
        const tileLayout = clsx(
          isBoolean ? "min-h-20" : "min-h-14 md:min-h-16",
          renderOrder.length === 3 && index === 2 && "col-span-2",
        )

        if (isSolo) {
          return (
            <motion.div
              key={key}
              data-testid={`solo-choice-tile-${key}`}
              variants={{
                ...reveal.item(50),
                popped: reveal.reduced
                  ? { opacity: 1, y: 0 }
                  : { opacity: 1, y: 0, scale: [1, 1.06, 1] },
              }}
              initial="hidden"
              animate={feedback && isPicked ? "popped" : "visible"}
              transition={feedback && isPicked ? reveal.snap : reveal.spring}
              className={clsx("relative flex", tileLayout)}
            >
              <AnswerButton
                colorIndex={key}
                correct={feedback && isPicked ? feedback.correct : undefined}
                className={clsx(
                  "w-full break-words hyphens-auto",
                  !reveal.reduced &&
                    !disabled &&
                    "transition-transform hover:scale-[1.02] hover:ring-4 hover:ring-white/40",
                  disabled && value !== null && value !== key && "opacity-40",
                  disabled && isPicked && "ring-4 ring-[var(--ring-selected)]",
                )}
                label={ANSWERS_LABELS[key]}
                disabled={disabled}
                onClick={handleTap(key)}
              >
                <Markdown>{answer || ""}</Markdown>
              </AnswerButton>
            </motion.div>
          )
        }

        return (
          <AnswerButton
            data-testid={`answer-btn-${key}`}
            key={key}
            className={clsx(
              tileLayout,
              "break-words hyphens-auto",
              ANSWERS_COLORS[key],
              !disabled && PRESS_FEEDBACK,
              disabled && value !== null && value !== key && "opacity-40",
              disabled && isPicked && "ring-4 ring-[var(--ring-selected)]",
            )}
            label={ANSWERS_LABELS[key]}
            disabled={disabled}
            onClick={handleTap(key)}
          >
            <Markdown>{answer || ""}</Markdown>
          </AnswerButton>
        )
      })}
    </div>
  )
}
