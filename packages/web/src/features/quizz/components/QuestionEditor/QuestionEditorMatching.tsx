import { useQuizzEditor } from "@razzoozle/web/features/quizz/contexts/quizz-editor-context"
import { Minus, Plus } from "lucide-react"
import { useTranslation } from "react-i18next"
import QuestionEditorSlotOptions, {
  type SlotDraft,
} from "./QuestionEditorSlotOptions"

type MatchDraft = SlotDraft & { label: string }

const defaultItem = (): MatchDraft => ({
  label: "",
  options: ["", ""],
  correctIndex: 0,
})

const QuestionEditorMatching = () => {
  const { currentQuestion, currentIndex, updateQuestion } = useQuizzEditor()
  const { t } = useTranslation()

  const leftItems: MatchDraft[] =
    currentQuestion.leftItems?.length
      ? currentQuestion.leftItems.map((i) => ({
          label: i.label,
          options: i.options,
          correctIndex: i.correctIndex,
        }))
      : [defaultItem()]

  const persist = (next: MatchDraft[]) => {
    updateQuestion(currentIndex, {
      type: "matching",
      leftItems: next,
      answers: undefined,
      solutions: undefined,
    })
  }

  const setItem = (idx: number, item: MatchDraft) => {
    const next = leftItems.slice()
    next[idx] = item
    persist(next)
  }

  const addItem = () => {
    if (leftItems.length >= 12) return
    persist([...leftItems, defaultItem()])
  }

  const removeItem = (idx: number) => {
    if (leftItems.length <= 1) return
    persist(leftItems.filter((_, i) => i !== idx))
  }

  return (
    <div className="z-10 flex flex-col gap-4 rounded-xl bg-white p-4 shadow-sm">
      {leftItems.map((item, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-lg border border-gray-100 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-gray-700">
              #{i + 1}
            </span>
            <button
              type="button"
              onClick={() => removeItem(i)}
              disabled={leftItems.length <= 1}
              className="inline-flex min-h-10 items-center gap-1 rounded-md border border-gray-200 px-2 text-sm disabled:opacity-40"
              aria-label={t("quizz:matching.removeItem", {
                defaultValue: "Remove pair",
              })}
            >
              <Minus className="h-4 w-4" />
            </button>
          </div>
          <input
            type="text"
            value={item.label}
            onChange={(e) => setItem(i, { ...item, label: e.target.value })}
            placeholder={t("quizz:matching.labelPlaceholder", {
              defaultValue: "Left label",
            })}
            className="min-h-10 rounded-md border border-gray-200 px-3 text-sm"
            data-testid={`matching-label-${i}`}
          />
          <QuestionEditorSlotOptions
            slot={{ options: item.options, correctIndex: item.correctIndex }}
            onChange={(s) => setItem(i, { ...item, ...s })}
            i18nPrefix="matching"
            testIdPrefix={`matching-item-${i}`}
          />
        </div>
      ))}

      <button
        type="button"
        onClick={addItem}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-dashed border-gray-300 text-sm font-medium"
        data-testid="matching-add-item"
      >
        <Plus className="h-4 w-4" />
        {t("quizz:matching.addItem", { defaultValue: "Add pair" })}
      </button>
    </div>
  )
}

export default QuestionEditorMatching
