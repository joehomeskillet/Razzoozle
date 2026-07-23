import clsx from "clsx"
import { useTranslation } from "react-i18next"
import type { AnswerViewProps } from "./types"
import SubmitButton from "./SubmitButton"
import { ANSWER_TILE_SURFACE } from "@razzoozle/web/features/game/utils/answers"

/**
 * TypeAnswerInput — Pure props component for free-text answer input.
 *
 * Extracted from Answers.tsx (MP mode) and SoloAnswers.tsx (Solo mode).
 * Renders a text input + submit button. Solo-specific feedback via optional
 * `feedback` prop (inert in MP). No socket/store/timer/motion imports.
 */
interface TypeAnswerInputProps extends AnswerViewProps<string> {
  /** Solo-specific feedback (correct/wrong indicator). MP ignores this. */
  feedback?: { correct: boolean }
  /** Test ID prefix ('' for MP, 'solo-' for Solo). Defaults to ''. */
  testIdPrefix?: '' | 'solo-'
}

export default function TypeAnswerInput({
  value,
  onChange,
  onSubmit,
  disabled,
  feedback,
  testIdPrefix = '',
}: TypeAnswerInputProps) {
  const { t } = useTranslation()

  // Determine if feedback styling should apply (Solo mode only, when result is ready).
  const hasFeedback = feedback !== undefined
  const showFeedback = hasFeedback

  return (
    <div className="mx-auto mb-4 flex w-full max-w-xl flex-col gap-4 px-4">
      <input
        data-testid={`${testIdPrefix}type-answer-input`}
        type="text"
        maxLength={200}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onSubmit()
          }
        }}
        disabled={disabled}
        placeholder={t("game:typeAnswerPlaceholder")}
        aria-label={t("game:typeAnswerPlaceholder")}
        autoFocus
        autoComplete="off"
        autoCorrect="off"
        className={clsx(
          "h-14 w-full rounded-[var(--radius-theme)] border border-[color:var(--border-hairline)] bg-white px-5 py-4 text-center text-lg text-[color:var(--game-fg)] placeholder-[color:var(--game-fg)]/60 outline-none focus:border-[color:var(--color-accent)] focus:ring-2 focus:ring-[color:var(--color-accent)] disabled:opacity-50 md:text-xl",
          showFeedback &&
            (feedback.correct
              ? "ring-2 ring-[var(--state-correct)]"
              : "ring-2 ring-[var(--state-wrong)]"),
        )}
      />
      <SubmitButton
        onClick={onSubmit}
        disabled={disabled || value.trim().length === 0}
        testId={`${testIdPrefix}type-answer-submit`}
      >
        {t("game:submitAnswer")}
      </SubmitButton>
    </div>
  )
}
