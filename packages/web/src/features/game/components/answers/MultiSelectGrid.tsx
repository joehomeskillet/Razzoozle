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

  const isBoolean = renderOrder.length === 2

  return (
    <div className="mx-auto mb-4 flex w-full max-w-7xl flex-col gap-4 px-2 lg:max-w-[85vw]">
      <p className="text-center text-sm font-medium text-[color:var(--game-fg)]/80">
        {t("quizz:multipleSelect.selectHint")}
      </p>
      <div className="grid w-full grid-cols-2 gap-1 text-lg font-bold md:text-xl lg:text-[clamp(1.25rem,3vh,2.5rem)]">
        {renderOrder.map((key: number, index: number) => {
          const answer = answers[key]
          const isPicked = value.includes(key)
          const tileLayout = clsx(
            isBoolean ? "min-h-20" : "min-h-14 md:min-h-16",
            renderOrder.length === 3 && index === 2 && "col-span-2",
          )

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
                className={clsx("relative flex", tileLayout)}
              >
                <AnswerButton
                  colorIndex={key}
                  correct={feedback && isPicked ? feedback.correct : undefined}
                  aria-pressed={isPicked}
                  aria-selected={isPicked}
                  className={clsx(
                    "w-full break-words hyphens-auto",
                    !reveal.reduced &&
                      !disabled &&
                      "transition-transform hover:scale-[1.02] hover:ring-4 hover:ring-white/40",
                    disabled && !isPicked && "opacity-40",
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
              aria-pressed={isPicked}
              aria-selected={isPicked}
              className={clsx(
                tileLayout,
                "break-words hyphens-auto",
                ANSWERS_COLORS[key],
                !disabled && PRESS_FEEDBACK,
                disabled && !isPicked && "opacity-40",
                isPicked && "ring-4 ring-[var(--ring-selected)]",
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
