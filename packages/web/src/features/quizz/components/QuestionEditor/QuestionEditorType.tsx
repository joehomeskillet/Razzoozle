import type { QuestionType } from "@razzoozle/common/types/game"
import { useQuizzEditor } from "@razzoozle/web/features/quizz/contexts/quizz-editor-context"
import { useManagerStore } from "@razzoozle/web/features/game/stores/manager"
import { buildTypePatch } from "@razzoozle/web/features/quizz/questionTypeTransition"
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
  TextCursorInput,
  Link2,
  MapPin,
  SlidersHorizontal,
  ToggleLeft,
  BookOpen,
  Cloud,
  Lightbulb,
  Gauge,
  GraduationCap,
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
    key: "fill-blank",
    labelKey: "quizz:type.fillBlank",
    descKey: "quizz:type.fillBlankDesc",
    icon: TextCursorInput,
  },
  {
    key: "matching",
    labelKey: "quizz:type.matching",
    descKey: "quizz:type.matchingDesc",
    icon: Link2,
  },
  {
    key: "drop-pin",
    labelKey: "quizz:type.dropPin",
    descKey: "quizz:type.dropPinDesc",
    icon: MapPin,
  },
  {
    key: "word-cloud",
    labelKey: "quizz:type.wordCloud",
    descKey: "quizz:type.wordCloudDesc",
    icon: Cloud,
  },
  {
    key: "brainstorm",
    labelKey: "quizz:type.brainstorm",
    descKey: "quizz:type.brainstormDesc",
    icon: Lightbulb,
  },
  {
    key: "confidence",
    labelKey: "quizz:type.confidence",
    descKey: "quizz:type.confidenceDesc",
    icon: Gauge,
  },
  {
    key: "micro-lesson",
    labelKey: "quizz:type.microLesson",
    descKey: "quizz:type.microLessonDesc",
    icon: GraduationCap,
  },
  {
    key: "vokabelliste",
    labelKey: "quizz:type.vokabelliste",
    descKey: "quizz:type.vokabellisteDesc",
    icon: BookOpen,
  },
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

  const setType = (next: QuestionTypeKey) => {
    updateQuestion(currentIndex, buildTypePatch(currentQuestion, next))
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
    </div>
  )
}

export default QuestionEditorType
