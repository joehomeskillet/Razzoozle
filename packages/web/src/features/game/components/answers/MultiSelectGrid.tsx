import type { AnswerViewProps } from "./types"
import Markdown from "@razzoozle/web/components/Markdown"
import AnswerButton from "@razzoozle/web/features/game/components/AnswerButton"
import SubmitButton from "./SubmitButton"
import { useReveal } from "@razzoozle/web/features/game/animation/presets"
import {
  ANSWERS_COLORS,
  ANSWERS_LABELS,
} from "@razzoozle/web/features/game/utils/answers"
import clsx from "clsx"
import { motion } from "motion/react"
import { useTranslation } from "react-i18next"

const PRESS_FEEDBACK =
  "transition-transform duration-150 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100"

interface Props extends AnswerViewProps<number[]> {
  /** Available answer options (keyed by index) */
  answers: (string | null)[]
  /** Display order permutation (canonical if undefined) */
  displayOrder?: number[]
}

/**
 * MultiSelectGrid — MP path (`testIdPrefix` unset) renders NO motion elements,
 * same CSS-only press feedback as before. Solo path (`testIdPrefix: "solo-"`)
 * wraps each tile in a `motion.div` for the lock-in pop + result-feedback
 * overlay, mirroring the pre-extraction SoloAnswers.tsx multi-select block
 * byte-for-byte (same pattern as ChoiceGrid's isSolo branch).
 */
export default function MultiSelectGrid({
  value,
  onChange,
  onSubmit,
  disabled,
  feedback,
  testIdPrefix = "",
  answers,
  displayOrder,
}: Props) {
  const { t } = useTranslation()
  const reveal = useReveal()
  const renderOrder = displayOrder ?? answers.map((_, i) => i)

  const handleToggle = (key: number) => () => {
    if (disabled) return
    onChange(
      value.includes(key)
        ? value.filter((k) => k !== key)
        : [...value, key],
    )
  }

  // Testid patterns: MP and Solo use different base names (byte-identical to existing)
  const isSolo = testIdPrefix === "solo-"
  const getTileTestId = (key: number) =>
    isSolo ? `solo-multiple-select-tile-${key}` : `answer-btn-${key}`
  const submitTestId = isSolo ? "solo-multiple-select-submit" : "multi-select-submit"

  return (
    <div className="mx-auto mb-4 flex w-full max-w-7xl flex-col gap-4 px-2 lg:max-w-[85vw]">
      <p className="text-center text-sm font-medium text-[color:var(--game-fg)]/80">
        {t("quizz:multipleSelect.selectHint")}
      </p>
      <div className="grid w-full grid-cols-2 gap-1 text-lg font-bold md:text-xl lg:text-[clamp(1.25rem,3vh,2.5rem)]">
        {renderOrder.map((key: number) => {
          const answer = answers[key]
          const isPicked = value.includes(key)

          if (isSolo) {
            return (
              <motion.div
                key={key}
                data-testid={getTileTestId(key)}
                variants={{
                  ...reveal.item(50),
                  popped: reveal.reduced
                    ? { opacity: 1, y: 0 }
                    : { opacity: 1, y: 0, scale: [1, 1.06, 1] },
                }}
                initial="hidden"
                animate={feedback && isPicked ? "popped" : "visible"}
                transition={feedback && isPicked ? reveal.snap : reveal.spring}
                className="flex"
              >
                <AnswerButton
                  colorIndex={key}
                  correct={feedback && isPicked ? feedback.correct : undefined}
                  className={clsx(
                    "w-full",
                    !reveal.reduced &&
                      !disabled &&
                      "transition-transform hover:scale-[1.02] hover:ring-4 hover:ring-white/40",
                    disabled && "opacity-50",
                    isPicked && "ring-4 ring-[var(--ring-selected)]",
                  )}
                  label={ANSWERS_LABELS[key]}
                  disabled={disabled}
                  onClick={handleToggle(key)}
                >
                  <Markdown>{answer || ""}</Markdown>
                </AnswerButton>
              </motion.div>
            )
          }

          return (
            <AnswerButton
              data-testid={getTileTestId(key)}
              key={key}
              className={clsx(
                ANSWERS_COLORS[key],
                !disabled && PRESS_FEEDBACK,
                disabled && "opacity-50",
                value.includes(key) && "ring-4 ring-[var(--ring-selected)]",
              )}
              label={ANSWERS_LABELS[key]}
              disabled={disabled}
              onClick={handleToggle(key)}
            >
              <Markdown>{answer || ""}</Markdown>
            </AnswerButton>
          )
        })}
      </div>
      <SubmitButton
        testId={submitTestId}
        onClick={onSubmit}
        disabled={disabled || value.length === 0}
      >
        {t("quizz:multipleSelect.submitButton")}
      </SubmitButton>
    </div>
  )
}
