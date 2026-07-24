import { useQuizzEditor } from "@razzoozle/web/features/quizz/contexts/quizz-editor-context"
import { Minus, Plus } from "lucide-react"
import { useTranslation } from "react-i18next"
import QuestionEditorSlotOptions, {
  type SlotDraft,
} from "./QuestionEditorSlotOptions"

const defaultSlot = (): SlotDraft => ({ options: ["", ""], correctIndex: 0 })

const QuestionEditorFillBlank = () => {
  const { currentQuestion, currentIndex, updateQuestion } = useQuizzEditor()
  const { t } = useTranslation()

  const slots: SlotDraft[] =
    currentQuestion.slots?.length
      ? currentQuestion.slots
      : [defaultSlot()]
  const segments =
    currentQuestion.segments?.length === slots.length + 1
      ? currentQuestion.segments
      : Array.from({ length: slots.length + 1 }, () => "")

  const persist = (nextSlots: SlotDraft[], nextSegments: string[]) => {
    updateQuestion(currentIndex, {
      type: "fill-blank",
      slots: nextSlots,
      segments: nextSegments,
      answers: undefined,
      solutions: undefined,
    })
  }

  const setSegment = (idx: number, value: string) => {
    const next = segments.slice()
    next[idx] = value
    persist(slots, next)
  }

  const setSlot = (idx: number, slot: SlotDraft) => {
    const next = slots.slice()
    next[idx] = slot
    persist(next, segments)
  }

  const addSlot = () => {
    if (slots.length >= 8) return
    const nextSlots = [...slots, defaultSlot()]
    // insert empty segment before trailing
    const nextSegments = [
      ...segments.slice(0, -1),
      "",
      segments[segments.length - 1] ?? "",
    ]
    persist(nextSlots, nextSegments)
  }

  const removeSlot = (idx: number) => {
    if (slots.length <= 1) return
    const nextSlots = slots.filter((_, i) => i !== idx)
    // drop segment after removed slot (keep leading text of that slot)
    const nextSegments = segments.filter((_, i) => i !== idx + 1)
    // ensure length = slots + 1
    while (nextSegments.length < nextSlots.length + 1) nextSegments.push("")
    persist(nextSlots, nextSegments.slice(0, nextSlots.length + 1))
  }

  return (
    <div className="z-10 flex flex-col gap-4 rounded-xl bg-white p-4 shadow-sm">
      <p className="text-sm text-gray-600">
        {t("quizz:fillBlank.placeholder", {
          defaultValue: "Text or blank",
        })}
      </p>

      {slots.map((slot, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-lg border border-gray-100 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-gray-700">
              #{i + 1}
            </span>
            <button
              type="button"
              onClick={() => removeSlot(i)}
              disabled={slots.length <= 1}
              className="inline-flex min-h-10 items-center gap-1 rounded-md border border-gray-200 px-2 text-sm disabled:opacity-40"
              aria-label={t("quizz:fillBlank.removeSlot", {
                defaultValue: "Remove blank",
              })}
            >
              <Minus className="h-4 w-4" />
            </button>
          </div>
          <input
            type="text"
            value={segments[i] ?? ""}
            onChange={(e) => setSegment(i, e.target.value)}
            placeholder={t("quizz:fillBlank.placeholder", {
              defaultValue: "Text before blank",
            })}
            className="min-h-10 rounded-md border border-gray-200 px-3 text-sm"
            data-testid={`fillblank-segment-${i}`}
          />
          <QuestionEditorSlotOptions
            slot={slot}
            onChange={(s) => setSlot(i, s)}
            i18nPrefix="fillBlank"
            testIdPrefix={`fillblank-slot-${i}`}
          />
        </div>
      ))}

      <input
        type="text"
        value={segments[slots.length] ?? ""}
        onChange={(e) => setSegment(slots.length, e.target.value)}
        placeholder={t("quizz:fillBlank.placeholder", {
          defaultValue: "Text after last blank",
        })}
        className="min-h-10 rounded-md border border-gray-200 px-3 text-sm"
        data-testid="fillblank-segment-trailing"
      />

      <button
        type="button"
        onClick={addSlot}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-dashed border-gray-300 text-sm font-medium"
        data-testid="fillblank-add-slot"
      >
        <Plus className="h-4 w-4" />
        {t("quizz:fillBlank.addSlot", { defaultValue: "Add blank" })}
      </button>
    </div>
  )
}

export default QuestionEditorFillBlank
