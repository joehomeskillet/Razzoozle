import type { QuestionType } from "@razzia/common/types/game"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import clsx from "clsx"
import { useTranslation } from "react-i18next"

const TYPES: Array<{ key: QuestionType; labelKey: string }> = [
  { key: "choice", labelKey: "quizz:type.choice" },
  { key: "boolean", labelKey: "quizz:type.boolean" },
  { key: "slider", labelKey: "quizz:type.slider" },
  { key: "poll", labelKey: "quizz:type.poll" },
  { key: "multiple-select", labelKey: "quizz:type.multipleSelect" },
  { key: "type-answer", labelKey: "quizz:type.typeAnswer" },
]

const SLIDER_FIELDS: Array<{
  field: "min" | "max" | "correct" | "step"
  labelKey: string
}> = [
  { field: "min", labelKey: "quizz:slider.min" },
  { field: "max", labelKey: "quizz:slider.max" },
  { field: "correct", labelKey: "quizz:slider.correct" },
  { field: "step", labelKey: "quizz:slider.step" },
]

const QuestionEditorType = () => {
  const { currentQuestion, currentIndex, updateQuestion } = useQuizzEditor()
  const { t } = useTranslation()
  const type: QuestionType = currentQuestion.type ?? "choice"

  // Clear fields that don't belong to the target type (avoid stale data).
  const SLIDER_CLEAR = {
    min: undefined,
    max: undefined,
    correct: undefined,
    step: undefined,
    unit: undefined,
  }
  const CHOICE_CLEAR = { answers: undefined, solutions: undefined }

  const setType = (next: QuestionType) => {
    if (next === "boolean") {
      updateQuestion(currentIndex, {
        type: "boolean",
        answers: ["Wahr", "Falsch"],
        solutions: currentQuestion.solutions?.filter((s) => s < 2).length
          ? currentQuestion.solutions.filter((s) => s < 2)
          : [0],
        ...SLIDER_CLEAR,
      })
    } else if (next === "slider") {
      updateQuestion(currentIndex, {
        type: "slider",
        min: currentQuestion.min ?? 0,
        max: currentQuestion.max ?? 100,
        correct: currentQuestion.correct ?? 50,
        step: currentQuestion.step ?? 1,
        unit: currentQuestion.unit ?? "",
        ...CHOICE_CLEAR,
      })
    } else if (next === "poll") {
      updateQuestion(currentIndex, {
        type: "poll",
        answers: currentQuestion.answers?.length
          ? currentQuestion.answers
          : ["", ""],
        solutions: [],
        bonus: undefined,
        ...SLIDER_CLEAR,
      })
    } else if (next === "multiple-select") {
      updateQuestion(currentIndex, {
        type: "multiple-select",
        answers:
          (currentQuestion.answers?.length ?? 0) >= 2
            ? currentQuestion.answers
            : ["", ""],
        solutions:
          (currentQuestion.solutions?.length ?? 0) >= 2
            ? currentQuestion.solutions
            : [0, 1],
        ...SLIDER_CLEAR,
      })
    } else if (next === "type-answer") {
      updateQuestion(currentIndex, {
        type: "type-answer",
        answers: undefined,
        solutions: undefined,
        acceptedAnswers: currentQuestion.acceptedAnswers ?? [],
        matchMode: currentQuestion.matchMode ?? "normalized",
        ...SLIDER_CLEAR,
      })
    } else {
      updateQuestion(currentIndex, {
        type: "choice",
        answers: currentQuestion.answers?.length
          ? currentQuestion.answers
          : ["", ""],
        solutions: currentQuestion.solutions?.length
          ? currentQuestion.solutions
          : [0],
        ...SLIDER_CLEAR,
      })
    }
  }

  // Bonus and practice are mutually exclusive (practice awards no points).
  const toggleBonus = () =>
    updateQuestion(currentIndex, {
      bonus: !currentQuestion.bonus,
      practice: false,
    })

  const togglePractice = () =>
    updateQuestion(currentIndex, {
      practice: !currentQuestion.practice,
      bonus: false,
    })

  const setNum =
    (field: "min" | "max" | "correct" | "step") =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      updateQuestion(currentIndex, {
        [field]: e.target.value === "" ? undefined : Number(e.target.value),
      })

  return (
    <div className="z-10 flex flex-col gap-3">
      <div className="flex gap-2">
        {TYPES.map((tp) => (
          <button
            key={tp.key}
            type="button"
            onClick={() => setType(tp.key)}
            className={clsx(
              "rounded-lg px-3 py-1.5 text-sm font-semibold",
              type === tp.key
                ? "bg-primary text-white"
                : "bg-white text-gray-500 hover:bg-gray-100",
            )}
          >
            {t(tp.labelKey)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-4">
        {type !== "poll" && (
          <label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-semibold text-gray-600">
            <input
              type="checkbox"
              checked={Boolean(currentQuestion.bonus)}
              onChange={toggleBonus}
              className="size-4 cursor-pointer"
            />
            <span aria-hidden="true">⭐</span> {t("quizz:type.bonusQuestion")}
          </label>
        )}
        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-semibold text-gray-600">
          <input
            type="checkbox"
            checked={Boolean(currentQuestion.practice)}
            onChange={togglePractice}
            className="size-4 cursor-pointer"
          />
          <span aria-hidden="true">🎯</span> {t("quizz:type.practiceQuestion")}
        </label>
      </div>

      {type === "slider" && (
        <div className="grid grid-cols-2 gap-3 rounded-2xl bg-white p-4 md:grid-cols-5">
          {SLIDER_FIELDS.map(({ field, labelKey }) => (
            <label
              key={field}
              className="flex flex-col gap-1 text-xs font-semibold text-gray-500"
            >
              {t(labelKey)}
              <input
                type="number"
                value={currentQuestion[field] ?? ""}
                onChange={setNum(field)}
                className="rounded-lg border border-gray-200 px-2 py-1 text-gray-800 outline-none"
              />
            </label>
          ))}
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500">
            {t("quizz:slider.unit")}
            <input
              value={currentQuestion.unit ?? ""}
              onChange={(e) =>
                updateQuestion(currentIndex, { unit: e.target.value })
              }
              placeholder={t("quizz:slider.unitPlaceholder")}
              className="rounded-lg border border-gray-200 px-2 py-1 text-gray-800 outline-none"
            />
          </label>
        </div>
      )}
    </div>
  )
}

export default QuestionEditorType
