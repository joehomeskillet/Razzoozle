import type { QuestionType } from "@razzoozle/common/types/game"
import { useQuizzEditor } from "@razzoozle/web/features/quizz/contexts/quizz-editor-context"
import { useManagerStore } from "@razzoozle/web/features/game/stores/manager"
import clsx from "clsx"
import {
  BarChart3,
  Blocks,
  Calculator,
  CircleDot,
  Keyboard,
  Languages,
  ListChecks,
  ListOrdered,
  MapPin,
  SlidersHorizontal,
  ToggleLeft,
  BookOpen,
  type LucideIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"

type QuestionTypeKey = QuestionType | "vokabelliste"

const TYPES: Array<{
  key: QuestionTypeKey
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
  {
    key: "sentence-builder",
    labelKey: "quizz:type.sentenceBuilder",
    descKey: "quizz:type.sentenceBuilderDesc",
    icon: Blocks,
  },
  {
    key: "sequencing",
    labelKey: "quizz:type.sequencing",
    descKey: "quizz:type.sequencingDesc",
    icon: ListOrdered,
  },
  {
    key: "mathematik",
    labelKey: "quizz:type.mathematik",
    descKey: "quizz:type.mathematikDesc",
    icon: Calculator,
  },
  {
    key: "wortarten",
    labelKey: "quizz:type.wortarten",
    descKey: "quizz:type.wortartenDesc",
    icon: Languages,
  },
  {
    key: "drop-pin",
    labelKey: "quizz:type.dropPin",
    descKey: "quizz:type.dropPinDesc",
    icon: MapPin,
  },
  {
    key: "vokabelliste",
    labelKey: "quizz:type.vokabelliste",
    descKey: "quizz:type.vokabellisteDesc",
    icon: BookOpen,
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

interface QuestionEditorTypeProps {
  excludeTypes?: QuestionTypeKey[]
}

const QuestionEditorType = ({ excludeTypes = [] }: QuestionEditorTypeProps) => {
  const { currentQuestion, currentIndex, updateQuestion } = useQuizzEditor()
  const { t } = useTranslation()
  const type: QuestionTypeKey = (currentQuestion.type ??
    "choice") as QuestionTypeKey

  const config = useManagerStore((s) => s.config)
  const klassenEnabled = config?.klassenEnabled ?? false

  const availableTypes = klassenEnabled
    ? TYPES.filter((tp) => !excludeTypes.includes(tp.key))
    : TYPES.filter(
        (tp) =>
          tp.key !== "mathematik" &&
          tp.key !== "wortarten" &&
          tp.key !== "vokabelliste" &&
          !excludeTypes.includes(tp.key),
      )

  const SLIDER_CLEAR = {
    min: undefined,
    max: undefined,
    correct: undefined,
    step: undefined,
    unit: undefined,
  }
  const CHOICE_CLEAR = { answers: undefined, solutions: undefined }

  const setType = (next: QuestionTypeKey) => {
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
    } else if (next === "sentence-builder") {
      updateQuestion(currentIndex, {
        type: "sentence-builder",
        chunks: ["", ""],
        answers: undefined,
        solutions: undefined,
        acceptedAnswers: undefined,
        matchMode: undefined,
        ...SLIDER_CLEAR,
      })
    } else if (next === "sequencing") {
      updateQuestion(currentIndex, {
        type: "sequencing",
        items: [],
        correctOrder: [],
        answers: undefined,
        solutions: undefined,
        acceptedAnswers: undefined,
        matchMode: undefined,
        chunks: undefined,
        ...SLIDER_CLEAR,
      })
    } else if (next === "mathematik") {
      updateQuestion(currentIndex, {
        type: "mathematik",
        correct: 0,
        tolerance: 0.1,
        decimals: 2,
        answers: undefined,
        solutions: undefined,
        acceptedAnswers: undefined,
        matchMode: undefined,
        chunks: undefined,
        min: undefined,
        max: undefined,
        step: undefined,
        unit: undefined,
      })
    } else if (next === "wortarten") {
      updateQuestion(currentIndex, {
        type: "wortarten",
        sentence: "",
        tokens: [],
        posSet: [
          "Nomen",
          "Verb",
          "Adjektiv",
          "Artikel",
          "Pronomen",
          "Adverb",
          "Präposition",
          "Konjunktion",
        ],
        answers: undefined,
        solutions: undefined,
        acceptedAnswers: undefined,
        matchMode: undefined,
        chunks: undefined,
        min: undefined,
        max: undefined,
        correct: undefined,
        step: undefined,
        unit: undefined,
      })
    } else if (next === "drop-pin") {
      updateQuestion(currentIndex, {
        type: "drop-pin",
        hotspots: [{ x: 0.25, y: 0.25, w: 0.25, h: 0.25 }],
        answers: undefined,
        solutions: undefined,
        acceptedAnswers: undefined,
        matchMode: undefined,
        chunks: undefined,
        items: undefined,
        correctOrder: undefined,
        ...SLIDER_CLEAR,
      })
    } else if (next === "vokabelliste") {
      updateQuestion(currentIndex, {
        type: "vokabelliste" as QuestionType,
        question: "",
        answers: undefined,
        solutions: undefined,
        acceptedAnswers: undefined,
        matchMode: undefined,
        chunks: undefined,
        min: undefined,
        max: undefined,
        correct: undefined,
        step: undefined,
        unit: undefined,
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    let delta = 0
    if (e.key === "ArrowRight" || e.key === "ArrowDown") delta = 1
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") delta = -1
    else return

    e.preventDefault()
    const currentIdx = availableTypes.findIndex((tp) => tp.key === type)
    const fallbackIdx = currentIdx === -1 ? 0 : currentIdx
    const nextIdx =
      (fallbackIdx + delta + availableTypes.length) % availableTypes.length
    setType(availableTypes[nextIdx].key)
  }

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
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      updateQuestion(currentIndex, {
        [field]: value === "" ? undefined : Number.parseFloat(value),
      })
    }

  const setUnit = (e: React.ChangeEvent<HTMLInputElement>) =>
    updateQuestion(currentIndex, { unit: e.target.value })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-4 text-sm font-semibold text-gray-800">
          Fragentyp
        </h2>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
          {availableTypes.map((tp) => {
            const Icon = tp.icon
            return (
              <button
                key={tp.key}
                role="radio"
                aria-checked={type === tp.key}
                tabIndex={type === tp.key ? 0 : -1}
                onClick={() => setType(tp.key)}
                onKeyDown={handleKeyDown}
                className={clsx(
                  "flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
                  type === tp.key
                    ? "border-primary bg-primary/5"
                    : "border-gray-200 bg-gray-50 hover:border-gray-300",
                )}
              >
                <Icon className="size-5" />
                <span className="text-xs font-semibold text-center text-gray-700">
                  {t(tp.labelKey)}
                </span>
                <span className="text-xs text-gray-500 text-center line-clamp-2">
                  {t(tp.descKey)}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {type === "slider" && (
        <div className="grid gap-4 grid-cols-2">
          {SLIDER_FIELDS.map(({ field, labelKey }) => (
            <label key={field} className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-gray-700">
                {t(labelKey)}
              </span>
              <input
                type="number"
                value={currentQuestion[field] ?? ""}
                onChange={setNum(field)}
                className="h-8 rounded-md border border-gray-300 px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
              />
            </label>
          ))}
          <label className="flex flex-col gap-2 col-span-2">
            <span className="text-xs font-semibold text-gray-700">
              {t("quizz:slider.unit")}
            </span>
            <input
              type="text"
              value={currentQuestion.unit ?? ""}
              onChange={setUnit}
              placeholder={t("quizz:slider.unitPlaceholder")}
              className="h-8 rounded-md border border-gray-300 px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
            />
          </label>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={currentQuestion.bonus ?? false}
            onChange={toggleBonus}
            className="h-4 w-4 rounded border-gray-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
          />
          <span className="text-sm font-semibold text-gray-700">
            {t("quizz:type.bonusQuestion")}
          </span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={currentQuestion.practice ?? false}
            onChange={togglePractice}
            className="h-4 w-4 rounded border-gray-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
          />
          <span className="text-sm font-semibold text-gray-700">
            {t("quizz:type.practiceQuestion")}
          </span>
        </label>
      </div>
    </div>
  )
}

export default QuestionEditorType
