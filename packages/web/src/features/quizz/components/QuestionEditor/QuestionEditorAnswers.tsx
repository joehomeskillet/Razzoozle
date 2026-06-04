import {
  ANSWERS_COLORS,
  ANSWERS_LABELS,
} from "@razzia/web/features/game/utils/constants"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import clsx from "clsx"
import { Check, Minus, Plus } from "lucide-react"
import { useTranslation } from "react-i18next"

const QuestionEditorAnswers = () => {
  const { currentQuestion, currentIndex, updateQuestion } = useQuizzEditor()
  const { t } = useTranslation()

  if (!currentQuestion.answers || !currentQuestion.solutions) {
    return null
  }

  const answers = currentQuestion.answers ?? []
  const solutions = currentQuestion.solutions ?? []

  const isPoll = currentQuestion.type === "poll"

  const updateAnswer = (index: number, value: string) => {
    const next = [...answers]
    next[index] = value
    updateQuestion(currentIndex, { answers: next })
  }

  const addAnswer = () => {
    if (answers.length >= 4) {
      return
    }

    updateQuestion(currentIndex, { answers: [...answers, ""] })
  }

  const removeAnswer = () => {
    if (answers.length <= 2) {
      return
    }

    const next = answers.slice(0, -1)
    const maxIndex = next.length - 1
    const nextSolution = solutions.filter((s) => s <= maxIndex)

    updateQuestion(currentIndex, {
      answers: next,
      solutions: nextSolution.length > 0 ? nextSolution : [0],
    })
  }

  const toggleSolution = (index: number) => {
    if (solutions.includes(index)) {
      const next = solutions.filter((s) => s !== index)
      updateQuestion(currentIndex, {
        solutions: next.length > 0 ? next : [index],
      })
    } else {
      updateQuestion(currentIndex, { solutions: [...solutions, index] })
    }
  }

  return (
    <div className="z-10 flex flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <div className="rounded-lg bg-white px-2 py-1 text-sm font-semibold text-gray-500">
          {answers.length}
          {t("quizz:answersCountSuffix")}
        </div>
        <div className="flex gap-2">
          <button
            onClick={removeAnswer}
            disabled={answers.length <= 2}
            className="flex size-7 items-center justify-center rounded-lg bg-gray-200 text-gray-600 hover:bg-gray-300 disabled:opacity-40"
          >
            <Minus className="size-4" />
          </button>
          <button
            onClick={addAnswer}
            disabled={answers.length >= 4}
            className="flex size-7 items-center justify-center rounded-lg bg-gray-200 text-gray-600 hover:bg-gray-300 disabled:opacity-40"
          >
            <Plus className="size-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {answers.map((answer, i) => {
          const isSelected = solutions.includes(i)
          const label = ANSWERS_LABELS[i]

          return (
            <div
              key={i}
              className={clsx(
                "flex items-center gap-3 rounded-2xl px-4 py-6",
                ANSWERS_COLORS[i],
              )}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-black/20 text-sm font-bold text-white md:size-8 md:text-base">
                {label}
              </span>
              <div className="flex flex-1 items-center justify-between gap-1.5 drop-shadow-md">
                <input
                  className="w-full bg-transparent font-semibold text-white placeholder-white/70 outline-none"
                  placeholder={t("quizz:addAnswerPlaceholder")}
                  aria-label={t("quizz:answerInputLabel", { label })}
                  value={answer}
                  onChange={(e) => updateAnswer(i, e.target.value)}
                />
                {!isPoll && (
                  <button
                    type="button"
                    onClick={() => toggleSolution(i)}
                    aria-pressed={isSelected}
                    aria-label={t("quizz:markAnswerCorrectLabel", { label })}
                    className={clsx(
                      "flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      isSelected
                        ? "border-white bg-white text-green-600"
                        : "border-white/60 bg-transparent",
                    )}
                  >
                    {isSelected && <Check className="size-4 stroke-5" />}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default QuestionEditorAnswers
