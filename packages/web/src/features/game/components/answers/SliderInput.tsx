import type { AnswerViewProps } from "@razzoozle/web/features/game/components/answers/types"
import { useTranslation } from "react-i18next"
import clsx from "clsx"

interface SliderInputProps extends AnswerViewProps<number> {
  min: number
  max: number
  step?: number
  unit?: string
}

const PRESS_FEEDBACK =
  "transition-transform duration-150 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100"

export default function SliderInput({
  value,
  onChange,
  onSubmit,
  disabled,
  min,
  max,
  step = 1,
  unit,
  feedback,
  testIdPrefix = "",
}: SliderInputProps) {
  const { t } = useTranslation()

  return (
    <div className="mx-auto mb-4 flex w-full max-w-2xl flex-col items-center gap-4 px-4">
      {/* Slider value display */}
      <div className={clsx(
        "text-5xl font-bold text-[color:var(--game-fg)]",
        testIdPrefix === "solo-" && "drop-shadow-lg",
        feedback && (
          feedback.correct
            ? "ring-2 ring-[var(--state-correct)]"
            : "ring-2 ring-[var(--state-wrong)]"
        ),
        "lg:text-[clamp(3rem,8vh,8rem)]"
      )}>
        {value}
        {unit ? ` ${unit}` : ""}
      </div>

      {/* Slider input */}
      <input
        data-testid={`${testIdPrefix}slider-input`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={t("game:sliderAnswerLabel", {
          defaultValue: "Answer value",
        })}
        aria-valuetext={`${value}${unit ? ` ${unit}` : ""}`}
        className="quiz-range accent-primary h-3 w-full cursor-pointer appearance-none rounded-full bg-[color:var(--color-field-ink)]/5 disabled:cursor-not-allowed lg:h-[clamp(0.75rem,1.5vh,1.5rem)]"
      />

      {/* Min/Max labels */}
      <div className="flex w-full justify-between text-sm font-semibold text-[color:var(--game-fg)]/70 lg:text-[clamp(1rem,2.5vh,2rem)]">
        <span>
          {min}
          {unit ? ` ${unit}` : ""}
        </span>
        <span>
          {max}
          {unit ? ` ${unit}` : ""}
        </span>
      </div>

      {/* Submit button */}
      <button
        data-testid={`${testIdPrefix}slider-submit`}
        type="button"
        onClick={onSubmit}
        disabled={disabled}
        className={clsx(
          "bg-[var(--color-primary)] rounded-xl px-8 py-3 text-xl font-bold text-white disabled:opacity-50 lg:px-12 lg:py-5 lg:text-[clamp(1.25rem,3vh,2.5rem)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
          PRESS_FEEDBACK,
        )}
      >
        {disabled ? t("game:slider.submitted") : t("game:slider.submit")}
      </button>
    </div>
  )
}
