import type { QuestionType } from "@razzia/common/types/game"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import clsx from "clsx"

const TYPES: { key: QuestionType; label: string }[] = [
  { key: "choice", label: "Auswahl" },
  { key: "boolean", label: "Wahr / Falsch" },
  { key: "slider", label: "Slider (Zahl)" },
  { key: "poll", label: "Umfrage" },
]

const SLIDER_FIELDS: { field: "min" | "max" | "correct" | "step"; label: string }[] =
  [
    { field: "min", label: "Min" },
    { field: "max", label: "Max" },
    { field: "correct", label: "Richtig" },
    { field: "step", label: "Schritt" },
  ]

const QuestionEditorType = () => {
  const { currentQuestion, currentIndex, updateQuestion } = useQuizzEditor()
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
            {tp.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-4">
        {type !== "poll" && (
          <label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-semibold text-gray-600">
            <input
              type="checkbox"
              checked={!!currentQuestion.bonus}
              onChange={toggleBonus}
              className="size-4 cursor-pointer"
            />
            ⭐ Bonusfrage (doppelte Punkte)
          </label>
        )}
        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-semibold text-gray-600">
          <input
            type="checkbox"
            checked={!!currentQuestion.practice}
            onChange={togglePractice}
            className="size-4 cursor-pointer"
          />
          🎯 Übungsfrage (0 Punkte)
        </label>
      </div>

      {type === "slider" && (
        <div className="grid grid-cols-2 gap-3 rounded-2xl bg-white p-4 md:grid-cols-5">
          {SLIDER_FIELDS.map(({ field, label }) => (
            <label
              key={field}
              className="flex flex-col gap-1 text-xs font-semibold text-gray-500"
            >
              {label}
              <input
                type="number"
                value={currentQuestion[field] ?? ""}
                onChange={setNum(field)}
                className="rounded-lg border border-gray-200 px-2 py-1 text-gray-800 outline-none"
              />
            </label>
          ))}
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500">
            Einheit
            <input
              value={currentQuestion.unit ?? ""}
              onChange={(e) =>
                updateQuestion(currentIndex, { unit: e.target.value })
              }
              placeholder="z.B. kWh"
              className="rounded-lg border border-gray-200 px-2 py-1 text-gray-800 outline-none"
            />
          </label>
        </div>
      )}
    </div>
  )
}

export default QuestionEditorType
