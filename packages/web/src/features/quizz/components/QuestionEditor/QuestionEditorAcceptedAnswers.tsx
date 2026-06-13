import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { Minus, Plus } from "lucide-react"
import { useTranslation } from "react-i18next"

type MatchMode = NonNullable<
  ReturnType<typeof useQuizzEditor>["currentQuestion"]["matchMode"]
>

const MATCH_MODES: MatchMode[] = ["exact", "normalized", "fuzzy"]

const QuestionEditorAcceptedAnswers = () => {
  const { currentQuestion, currentIndex, updateQuestion } = useQuizzEditor()
  const { t } = useTranslation()

  const acceptedAnswers = currentQuestion.acceptedAnswers ?? []
  const matchMode = currentQuestion.matchMode ?? "normalized"

  const updateAnswer = (index: number, value: string) => {
    const next = acceptedAnswers.map((a, i) => (i === index ? value : a))
    updateQuestion(currentIndex, { acceptedAnswers: next })
  }

  const addAnswer = () => {
    if (acceptedAnswers.length >= 20) {
      return
    }

    updateQuestion(currentIndex, { acceptedAnswers: [...acceptedAnswers, ""] })
  }

  const removeAnswer = (index: number) => {
    if (acceptedAnswers.length <= 1) {
      return
    }

    const next = acceptedAnswers.filter((_, i) => i !== index)
    updateQuestion(currentIndex, { acceptedAnswers: next })
  }

  return (
    <div className="z-10 flex flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <div className="text-sm font-semibold text-gray-500">
          {t("quizz:typeAnswer.acceptedAnswersLabel")}
        </div>
        <button
          type="button"
          onClick={addAnswer}
          disabled={acceptedAnswers.length >= 20}
          aria-label={t("quizz:typeAnswer.addAcceptedAnswer")}
          className="flex size-7 items-center justify-center rounded-lg bg-gray-200 text-gray-600 hover:bg-gray-300 disabled:opacity-40"
        >
          <Plus className="size-4" />
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {acceptedAnswers.map((answer, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-gray-800 outline-none focus:border-primary"
              placeholder={t("quizz:typeAnswer.acceptedAnswerPlaceholder")}
              value={answer}
              onChange={(e) => updateAnswer(i, e.target.value)}
            />
            <button
              type="button"
              onClick={() => removeAnswer(i)}
              disabled={acceptedAnswers.length <= 1}
              aria-label={t("quizz:typeAnswer.removeAcceptedAnswer", {
                index: i + 1,
              })}
              className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gray-200 text-gray-600 hover:bg-gray-300 disabled:opacity-40"
            >
              <Minus className="size-4" />
            </button>
          </div>
        ))}
      </div>

      {acceptedAnswers.length < 1 && (
        <p className="text-sm text-amber-600">
          {t("quizz:typeAnswer.minAnswersRequired")}
        </p>
      )}

      <label className="flex w-fit flex-col gap-1 text-xs font-semibold text-gray-500">
        {t("quizz:typeAnswer.matchMode.label")}
        <select
          value={matchMode}
          onChange={(e) =>
            updateQuestion(currentIndex, {
              matchMode: e.target.value as MatchMode,
            })
          }
          className="rounded-lg border border-gray-200 px-2 py-1 text-gray-800 outline-none"
        >
          {MATCH_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {t(`quizz:typeAnswer.matchMode.${mode}`)}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

export default QuestionEditorAcceptedAnswers
