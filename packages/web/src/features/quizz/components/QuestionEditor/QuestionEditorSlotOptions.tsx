import { Minus, Plus } from "lucide-react"
import { useTranslation } from "react-i18next"

export type SlotDraft = {
  options: string[]
  correctIndex: number
}

type Props = {
  slot: SlotDraft
  onChange: (next: SlotDraft) => void
  i18nPrefix?: "fillBlank" | "matching"
  testIdPrefix?: string
}

/** Shared options + correctIndex picker for fill-blank and matching editors. */
export function QuestionEditorSlotOptions({
  slot,
  onChange,
  i18nPrefix = "fillBlank",
  testIdPrefix = "slot",
}: Props) {
  const { t } = useTranslation()
  const options = slot.options.length >= 2 ? slot.options : ["", ""]

  const setOption = (idx: number, value: string) => {
    const next = options.slice()
    next[idx] = value
    onChange({
      options: next,
      correctIndex: Math.min(slot.correctIndex, next.length - 1),
    })
  }

  const addOption = () => {
    if (options.length >= 12) return
    onChange({ options: [...options, ""], correctIndex: slot.correctIndex })
  }

  const removeOption = (idx: number) => {
    if (options.length <= 2) return
    const next = options.filter((_, i) => i !== idx)
    let correctIndex = slot.correctIndex
    if (idx === correctIndex) correctIndex = 0
    else if (idx < correctIndex) correctIndex -= 1
    onChange({ options: next, correctIndex: Math.min(correctIndex, next.length - 1) })
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {t(`quizz:${i18nPrefix}.optionsLabel`, { defaultValue: "Options" })}
      </span>
      {options.map((opt, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <input
            type="radio"
            name={`${testIdPrefix}-correct`}
            checked={slot.correctIndex === idx}
            onChange={() => onChange({ options, correctIndex: idx })}
            aria-label={t(`quizz:${i18nPrefix}.correctOption`, {
              defaultValue: "Correct option",
            })}
            data-testid={`${testIdPrefix}-correct-${idx}`}
          />
          <input
            type="text"
            value={opt}
            onChange={(e) => setOption(idx, e.target.value)}
            placeholder={t(`quizz:${i18nPrefix}.optionPlaceholder`, {
              defaultValue: "Option",
            })}
            className="min-h-10 flex-1 rounded-md border border-gray-200 px-3 text-sm"
            data-testid={`${testIdPrefix}-opt-${idx}`}
          />
          <button
            type="button"
            onClick={() => removeOption(idx)}
            disabled={options.length <= 2}
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md border border-gray-200 disabled:opacity-40"
            aria-label={t(`quizz:${i18nPrefix}.removeOption`, {
              defaultValue: "Remove option",
            })}
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addOption}
        disabled={options.length >= 12}
        className="inline-flex min-h-10 items-center justify-center gap-1 rounded-md border border-dashed border-gray-300 text-sm font-medium text-gray-700 disabled:opacity-40"
        data-testid={`${testIdPrefix}-add-opt`}
      >
        <Plus className="h-4 w-4" />
        {t(`quizz:${i18nPrefix}.optionPlaceholder`, { defaultValue: "Option" })}
      </button>
    </div>
  )
}

export default QuestionEditorSlotOptions
