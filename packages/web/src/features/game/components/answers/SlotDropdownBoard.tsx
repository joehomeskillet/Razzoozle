import clsx from "clsx"
import { useTranslation } from "react-i18next"
import { ANSWER_TILE_SURFACE } from "@razzoozle/web/features/game/utils/answers"
import type { AnswerViewProps } from "./types"

/** Per-slot selection; null means not yet chosen. */
export type SlotSelections = Array<number | null>

export type SlotDropdownBoardProps = AnswerViewProps<SlotSelections> & {
  /** Option lists per slot (play-time; no correctIndex). */
  slotOptions: string[][]
  /** Optional labels above each dropdown (matching left labels). */
  labels?: string[]
  /**
   * Fill-blank: interleave text segments with dropdowns.
   * When set, length should be slotOptions.length + 1.
   */
  segments?: string[]
  /** i18n namespace key prefix: game:fillBlank | game:matching */
  i18nPrefix?: "fillBlank" | "matching"
}

/**
 * Shared answer UI for fill-blank + matching: one native <select> per slot.
 * Submit stays disabled until every slot has a selection.
 */
export function SlotDropdownBoard({
  value,
  onChange,
  onSubmit,
  disabled,
  feedback,
  testIdPrefix = "",
  slotOptions,
  labels,
  segments,
  i18nPrefix = "fillBlank",
}: SlotDropdownBoardProps) {
  const { t } = useTranslation()
  const isSolo = testIdPrefix === "solo-"
  const allFilled =
    slotOptions.length > 0 &&
    value.length === slotOptions.length &&
    value.every((v) => v !== null && v !== undefined)

  const setSlot = (slotIdx: number, optionIdx: number) => {
    if (disabled) return
    const next = value.slice()
    while (next.length < slotOptions.length) next.push(null)
    next[slotIdx] = optionIdx
    onChange(next)
  }

  const renderSelect = (slotIdx: number, options: string[]) => (
    <select
      key={`slot-${slotIdx}`}
      value={value[slotIdx] ?? ""}
      disabled={disabled}
      onChange={(e) => {
        const v = e.target.value
        if (v === "") return
        setSlot(slotIdx, Number(v))
      }}
      data-testid={
        isSolo
          ? `solo-slot-select-${slotIdx}`
          : `slot-select-${slotIdx}`
      }
      className={clsx(
        "min-h-11 min-w-[8rem] rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-white px-3 py-2 text-base font-medium text-[color:var(--game-fg)] shadow-[var(--shadow-flat)]",
        disabled && "cursor-not-allowed opacity-70",
        feedback?.correct && "border-[var(--state-correct)]",
        feedback && !feedback.correct && "border-[var(--state-wrong)]",
      )}
      aria-label={
        labels?.[slotIdx] ??
        t(`game:${i18nPrefix}.selectOption`, {
          defaultValue: "Select option",
        })
      }
    >
      <option value="" disabled>
        {t(`game:${i18nPrefix}.selectOption`, {
          defaultValue: "Select option",
        })}
      </option>
      {options.map((opt, optIdx) => (
        <option key={optIdx} value={optIdx}>
          {opt}
        </option>
      ))}
    </select>
  )

  return (
    <div
      className={clsx(
        "mx-auto mb-4 flex w-full max-w-4xl flex-col gap-[var(--game-space-3)] px-4",
      )}
    >
      <div
        className={clsx(ANSWER_TILE_SURFACE, "flex flex-col gap-3 p-4")}
        data-testid={isSolo ? "solo-slot-board" : "slot-board"}
      >
        {segments && segments.length > 0 ? (
          <p className="flex flex-wrap items-center gap-x-1 gap-y-2 text-base leading-relaxed text-[color:var(--game-fg)] md:text-lg">
            {slotOptions.map((options, i) => (
              <span key={i} className="inline-flex flex-wrap items-center gap-1">
                <span>{segments[i] ?? ""}</span>
                {renderSelect(i, options)}
              </span>
            ))}
            <span>{segments[slotOptions.length] ?? ""}</span>
          </p>
        ) : (
          slotOptions.map((options, i) => (
            <div
              key={i}
              className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3"
            >
              {labels?.[i] != null && (
                <span className="min-w-[6rem] text-sm font-semibold text-[color:var(--game-fg)]">
                  {labels[i]}
                </span>
              )}
              {renderSelect(i, options)}
            </div>
          ))
        )}
      </div>

      {!allFilled && !disabled && (
        <p className="text-center text-sm text-[color:var(--game-fg)]/60">
          {t(`game:${i18nPrefix}.fillAllSlots`, {
            defaultValue: "Please fill all blanks",
          })}
        </p>
      )}

      <button
        type="button"
        disabled={disabled || !allFilled}
        onClick={onSubmit}
        data-testid={isSolo ? "solo-slot-submit" : "slot-submit"}
        className={clsx(
          "mx-auto min-h-12 w-full max-w-sm rounded-[var(--radius-theme)] px-6 py-3 text-base font-semibold text-white shadow-[var(--shadow-flat)]",
          allFilled && !disabled
            ? "bg-[var(--color-primary)] active:scale-[0.98]"
            : "cursor-not-allowed bg-[var(--color-primary)]/40",
        )}
      >
        {t("game:submitAnswer", { defaultValue: "Submit" })}
      </button>
    </div>
  )
}

export default SlotDropdownBoard
