import clsx from "clsx"
import { useTranslation } from "react-i18next"
import { ANSWERS_COLORS, ANSWER_TILE_SURFACE } from "@razzoozle/web/features/game/utils/answers"
import type { AnswerViewProps } from "./types"

export interface SequencingItem {
  label: string
  id: string
}

export interface SequencingBoardValue {
  bank: SequencingItem[]
  placed: SequencingItem[]
}

export type Props = AnswerViewProps<SequencingBoardValue>

const PRESS_FEEDBACK = "transition-transform duration-150 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100"

export function SequencingBoard({
  value,
  onChange,
  onSubmit,
  disabled,
  testIdPrefix = "",
}: Props) {
  const { t } = useTranslation()
  const isSolo = testIdPrefix === "solo-"

  const handleBankChipClick = (chip: SequencingItem) => {
    if (disabled) return
    onChange({
      bank: value.bank.filter((c) => c.id !== chip.id),
      placed: [...value.placed, chip],
    })
  }

  const handlePlacedChipClick = (chipId: string) => {
    if (disabled) return
    const chip = value.placed.find((c) => c.id === chipId)
    if (chip) {
      onChange({
        placed: value.placed.filter((c) => c.id !== chipId),
        bank: [...value.bank, chip],
      })
    }
  }

  const isComplete = value.bank.length === 0

  return (
    <div className="flex w-full flex-col gap-6">
      {/* 1. Answer-placement area */}
      <div className="flex min-h-[64px] flex-wrap items-center gap-2 rounded-xl border border-[var(--border-hairline)] bg-white p-4 shadow-[var(--shadow-flat)]">
        {value.placed.length === 0 ? (
          <p className="w-full text-center italic text-[var(--answer-text)] opacity-60">
            {t("game:sequencing.tapHint", "Tap items below to order them")}
          </p>
        ) : (
          value.placed.map((chip, idx) => (
            <button
              key={chip.id}
              type="button"
              disabled={disabled}
              onClick={() => handlePlacedChipClick(chip.id)}
              className={clsx(
                "inline-flex min-h-11 items-center rounded-lg px-4 py-3 font-medium text-white shadow-sm",
                ANSWERS_COLORS[idx % ANSWERS_COLORS.length],
                !disabled && PRESS_FEEDBACK
              )}
              aria-label={t("game:sequencing.removeItem", "Remove {{label}}", { label: chip.label })}
              data-testid={isSolo ? `solo-sequencing-placed-${chip.id}` : `sequencing-placed-${chip.id}`}
            >
              {chip.label}
            </button>
          ))
        )}
      </div>

      {/* 2. Item bank */}
      <div className={clsx("rounded-xl p-4", ANSWER_TILE_SURFACE)}>
        <p className="mb-3 text-sm font-medium text-[color:var(--game-fg)] opacity-80">
          {t("game:sequencing.itemBank", "Item bank")}
        </p>
        <div className="flex flex-wrap gap-2">
          {value.bank.map((chip, idx) => (
            <button
              key={chip.id}
              type="button"
              disabled={disabled}
              onClick={() => handleBankChipClick(chip)}
              className={clsx(
                "inline-flex min-h-11 items-center rounded-lg px-4 py-3 font-medium text-white shadow-sm border border-[var(--border-hairline)]",
                ANSWERS_COLORS[idx % ANSWERS_COLORS.length],
                PRESS_FEEDBACK,
                disabled && "opacity-40 grayscale"
              )}
              aria-label={t("game:sequencing.addItem", "Add {{label}}", { label: chip.label })}
              data-testid={isSolo ? `solo-sequencing-bank-${chip.id}` : `sequencing-item-${idx}`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Submit button */}
      <button
        type="button"
        disabled={disabled || !isComplete}
        onClick={onSubmit}
        className={clsx(
          "w-full min-h-11 rounded-xl py-3 font-bold text-white shadow-sm",
          "bg-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
          !disabled && isComplete && PRESS_FEEDBACK,
          disabled || !isComplete ? "cursor-not-allowed opacity-50" : ""
        )}
        data-testid={isSolo ? "solo-sequencing-submit" : "sequencing-submit"}
      >
        {t("game:sequencing.submit", "Submit")}
      </button>
    </div>
  )
}
