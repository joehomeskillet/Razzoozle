import { useQuizzEditor } from "@razzoozle/web/features/quizz/contexts/quizz-editor-context"
import { useTranslation } from "react-i18next"

const QuestionEditorMathe = () => {
  const { currentQuestion, currentIndex, updateQuestion } = useQuizzEditor()
  const { t } = useTranslation()

  const updateField = (field: string, value: any) => {
    updateQuestion(currentIndex, { [field]: value })
  }

  const correct = currentQuestion.correct ?? 0
  const tolerance = currentQuestion.tolerance ?? 0.1
  const decimals = currentQuestion.decimals ?? 2

  return (
    <div className="z-10 flex flex-col gap-4 rounded-xl bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3">
        <label className="text-sm font-semibold text-gray-700">
          {t("quizz:mathematik.correct", "Correct answer")}
        </label>
        <input
          type="number"
          step="0.01"
          value={correct}
          onChange={(e) => updateField("correct", e.target.value === "" ? undefined : Number(e.target.value))}
          className="rounded-lg border border-[var(--border-hairline)] bg-white px-3 py-2 text-gray-800 outline-none placeholder:text-gray-400 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
          placeholder="0"
        />
      </div>

      <div className="flex flex-col gap-3">
        <label className="text-sm font-semibold text-gray-700">
          {t("quizz:mathematik.tolerance", "Tolerance")}
        </label>
        <input
          type="number"
          step="0.01"
          value={tolerance}
          onChange={(e) => updateField("tolerance", e.target.value === "" ? undefined : Number(e.target.value))}
          className="rounded-lg border border-[var(--border-hairline)] bg-white px-3 py-2 text-gray-800 outline-none placeholder:text-gray-400 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
          placeholder="0.1"
        />
      </div>

      <div className="flex flex-col gap-3">
        <label className="text-sm font-semibold text-gray-700">
          {t("quizz:mathematik.decimals", "Decimal places")}
        </label>
        <input
          type="number"
          min="0"
          max="10"
          value={decimals}
          onChange={(e) => updateField("decimals", e.target.value === "" ? undefined : Number(e.target.value))}
          className="rounded-lg border border-[var(--border-hairline)] bg-white px-3 py-2 text-gray-800 outline-none placeholder:text-gray-400 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
          placeholder="2"
        />
      </div>
    </div>
  )
}

export default QuestionEditorMathe
