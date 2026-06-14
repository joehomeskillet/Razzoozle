import type { QuestionType } from "@razzia/common/types/game"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import clsx from "clsx"
import {
  BarChart3,
  CircleDot,
  Keyboard,
  ListChecks,
  SlidersHorizontal,
  ToggleLeft,
  type LucideIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"

const TYPES: Array<{
  key: QuestionType
  labelKey: string
  descKey: string
  icon: LucideIcon
}> = [
  {
    key: "choice",
    labelKey: "quizz:type.choice",
    descKey: "quizz:type.choiceDesc",
    icon: CircleDot,
  },
  {
    key: "boolean",
    labelKey: "quizz:type.boolean",
    descKey: "quizz:type.booleanDesc",
    icon: ToggleLeft,
  },
  {
    key: "slider",
    labelKey: "quizz:type.slider",
    descKey: "quizz:type.sliderDesc",
    icon: SlidersHorizontal,
  },
  {
    key: "poll",
    labelKey: "quizz:type.poll",
    descKey: "quizz:type.pollDesc",
    icon: BarChart3,
  },
  {
    key: "multiple-select",
    labelKey: "quizz:type.multipleSelect",
    descKey: "quizz:type.multipleSelectDesc",
    icon: ListChecks,
  },
  {
    key: "type-answer",
    labelKey: "quizz:type.typeAnswer",
    descKey: "quizz:type.typeAnswerDesc",
    icon: Keyboard,
  },
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

  // Roving-tabindex arrow navigation across the radio cards (wraps).
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    let delta = 0
    if (e.key === "ArrowRight" || e.key === "ArrowDown") delta = 1
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") delta = -1
    else return

    e.preventDefault()
    const currentIdx = TYPES.findIndex((tp) => tp.key === type)
    const fallbackIdx = currentIdx === -1 ? 0 : currentIdx
    const nextIdx = (fallbackIdx + delta + TYPES.length) % TYPES.length
    setType(TYPES[nextIdx].key)
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
      <fieldset
        role="radiogroup"
        aria-label={t("quizz:type.choice")}
        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
      >
        {TYPES.map((tp) => {
          const selected = type === tp.key
          const Icon = tp.icon
          return (
            <button
              key={tp.key}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => setType(tp.key)}
              onKeyDown={handleKeyDown}
              className={clsx(
                "flex min-h-11 flex-col gap-1 rounded-2xl bg-white p-3 text-left shadow-sm outline-2 -outline-offset-2 transition-colors focus-visible:outline-[var(--color-primary)]",
                selected
                  ? "bg-[color-mix(in_srgb,var(--color-primary),white_92%)] outline-[var(--color-primary)]"
                  : "outline-transparent hover:bg-gray-50",
              )}
            >
              <span
                className={clsx(
                  "flex items-center gap-2 text-sm font-semibold",
                  selected ? "text-[var(--accent-contrast)]" : "text-gray-700",
                )}
              >
                <Icon
                  aria-hidden="true"
                  className={clsx(
                    "size-4 shrink-0",
                    selected
                      ? "text-[var(--accent-contrast)]"
                      : "text-gray-400",
                  )}
                />
                {t(tp.labelKey)}
              </span>
              <span className="text-xs text-gray-500">{t(tp.descKey)}</span>
            </button>
          )
        })}
      </fieldset>

      <div className="flex flex-wrap gap-4">
        {type !== "poll" && (
          <label className="flex min-h-11 w-fit cursor-pointer items-center gap-2 text-sm font-semibold text-gray-600">
            <input
              type="checkbox"
              checked={Boolean(currentQuestion.bonus)}
              onChange={toggleBonus}
              className="accent-primary focus-visible:outline-primary size-5 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2"
            />
            <span aria-hidden="true">⭐</span> {t("quizz:type.bonusQuestion")}
          </label>
        )}
        <label className="flex min-h-11 w-fit cursor-pointer items-center gap-2 text-sm font-semibold text-gray-600">
          <input
            type="checkbox"
            checked={Boolean(currentQuestion.practice)}
            onChange={togglePractice}
            className="accent-primary focus-visible:outline-primary size-5 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2"
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
                className="focus-visible:border-primary rounded-lg border border-gray-200 px-2 py-1 text-gray-800 focus-visible:outline-none"
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
              className="focus-visible:border-primary rounded-lg border border-gray-200 px-2 py-1 text-gray-800 focus-visible:outline-none"
            />
          </label>
        </div>
      )}
    </div>
  )
}

export default QuestionEditorType
