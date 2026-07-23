import clsx from "clsx"
import { useTranslation } from "react-i18next"
import { ANSWERS_COLORS, ANSWER_TILE_SURFACE } from "@razzoozle/web/features/game/utils/answers"
import type { AnswerViewProps } from "./types"

interface Chip {
  text: string
  originalIndex: number
  id: string
}

interface SentenceBuilderValue {
  bank: Chip[]
  placed: Chip[]
}

type Props = AnswerViewProps<SentenceBuilderValue>

const PRESS_FEEDBACK = "transition-transform duration-150 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100"

export default function SentenceBuilderBoard({
  value,
  onChange,
  onSubmit,
  disabled,
  feedback,
  testIdPrefix = "",
}: Props) {
  const { t } = useTranslation()
  const isSolo = testIdPrefix === "solo-"

  const handleBankChipClick = (chip: Chip) => {
    if (disabled) return
    onChange({
      bank: value.bank.filter(c => c.id !== chip.id),
      placed: [...value.placed, chip],
    })
  }

  const handlePlacedChipClick = (chipId: string) => {
    if (disabled) return
    const chip = value.placed.find(c => c.id === chipId)
    if (chip) {
      onChange({
        placed: value.placed.filter(c => c.id !== chipId),
        bank: [...value.bank, chip],
      })
    }
  }

  const isComplete = value.bank.length === 0

  return (
    <div className="mx-auto mb-4 flex w-full max-w-4xl flex-col gap-[var(--game-space-3)] px-4">
      {/* Placed/answer area */}
      <div
        className={clsx(
          "flex min-h-[64px] flex-wrap content-start items-center gap-2 rounded-[var(--radius-theme)] border border-dashed border-[var(--border-hairline)] bg-white p-4 shadow-[var(--shadow-flat)]",
          feedback?.correct && "bg-[var(--state-correct)]",
          feedback && !feedback.correct && "bg-[var(--state-wrong)]",
        )}
        {...(isSolo && { "data-testid": "solo-sentence-builder-answer-bar" })}
      >
        {value.placed.length === 0 ? (
          <p className="text-sm text-[color:var(--game-fg)]/60">
            {t("game:sentenceBuilder.tapHint", {
              defaultValue: "Tap the words below to build your answer",
            })}
          </p>
        ) : (
          value.placed.map((chip, idx) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => handlePlacedChipClick(chip.id)}
              disabled={disabled}
              {...(isSolo && { "data-testid": `solo-sentence-builder-placed-${chip.id}` })}
              className={clsx(
                "inline-flex min-h-11 items-center rounded-[var(--radius-theme)] border border-[var(--border-hairline)] px-4 py-3 text-base font-medium md:text-lg",
                ANSWERS_COLORS[idx % ANSWERS_COLORS.length],
                !disabled && PRESS_FEEDBACK,
                disabled && "cursor-not-allowed",
              )}
              aria-label={t("game:sentenceBuilder.removeChunk", {
                defaultValue: "Remove {{chunk}}",
                chunk: chip.text,
              })}
            >
              {chip.text}
            </button>
          ))
        )}
      </div>

      {/* Word bank */}
      <div
        className={clsx(ANSWER_TILE_SURFACE, "p-4")}
        {...(isSolo && { "data-testid": "solo-sentence-builder-bank" })}
      >
        <p className="mb-2 text-sm font-semibold text-[color:var(--game-fg)]">
          {t("game:sentenceBuilder.wordBank", {
            defaultValue: "Word bank",
          })}
        </p>
        <div className="flex flex-wrap gap-2">
          {value.bank.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => handleBankChipClick(chip)}
              disabled={disabled}
              data-testid={isSolo ? `solo-sentence-builder-bank-${chip.id}` : `sentence-chunk-${chip.originalIndex}`}
              className={clsx(
                "inline-flex min-h-11 items-center rounded-[var(--radius-theme)] border border-[var(--border-hairline)] px-4 py-3 text-base font-medium md:text-lg",
                ANSWERS_COLORS[chip.originalIndex % ANSWERS_COLORS.length],
                !disabled && PRESS_FEEDBACK,
                disabled && "cursor-not-allowed opacity-40 grayscale",
              )}
              aria-label={t("game:sentenceBuilder.addChunk", {
                defaultValue: "Add {{chunk}}",
                chunk: chip.text,
              })}
            >
              {chip.text}
            </button>
          ))}
        </div>
      </div>

      {/* Submit button */}
      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled || !isComplete}
        data-testid={isSolo ? "solo-sentence-builder-submit" : "sentence-submit"}
        className={clsx(
          "bg-[var(--color-primary)] rounded-xl px-8 py-3 text-xl font-bold text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] lg:px-12 lg:py-5 lg:text-[clamp(1.25rem,3vh,2.5rem)]",
          !disabled && PRESS_FEEDBACK,
        )}
      >
        {t("game:sentenceBuilder.submit", { defaultValue: "Submit" })}
      </button>
    </div>
  )
}
