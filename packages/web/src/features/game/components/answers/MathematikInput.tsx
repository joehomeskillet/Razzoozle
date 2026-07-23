import type { AnswerViewProps } from "@razzoozle/web/features/game/components/answers/types"
import { ANSWER_TILE_SURFACE } from "@razzoozle/web/features/game/utils/answers"
import SubmitButton from "@razzoozle/web/features/game/components/answers/SubmitButton"
import clsx from "clsx"
import { useTranslation } from "react-i18next"

interface MathematikInputProps extends AnswerViewProps<string> {
  /** Decimals hint (Solo mode only) */
  decimalsHint?: string
}

export default function MathematikInput({
  value,
  onChange,
  onSubmit,
  disabled,
  feedback: _feedback,
  testIdPrefix: _testIdPrefix,
  decimalsHint,
}: MathematikInputProps) {
  const { t } = useTranslation()

  return (
    <div className="mx-auto mb-4 flex w-full max-w-xl flex-col gap-4 px-4">
      <input
        data-testid="mathematik-input"
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => {
          let val = e.target.value
          // Accept both comma and point, display with point
          val = val.replace(",", ".")
          onChange(val)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onSubmit()
          }
        }}
        disabled={disabled}
        placeholder={decimalsHint || t("game:typeAnswerPlaceholder")}
        aria-label="Numeric answer"
        autoFocus
        className={clsx(
          ANSWER_TILE_SURFACE,
          "w-full px-5 py-4 text-center text-2xl font-semibold tabular-nums text-[color:var(--game-fg)] placeholder-[color:var(--game-fg)]/60 outline-none focus:border-[color:var(--color-accent)] focus:ring-2 focus:ring-[color:var(--color-accent)] disabled:opacity-50 md:text-3xl lg:py-6",
        )}
      />
      <SubmitButton
        onClick={onSubmit}
        disabled={disabled || value.trim().length === 0}
        testId="mathematik-submit"
      >
        {t("game:submitAnswer")}
      </SubmitButton>
    </div>
  )
}
