import type { QuestionType } from "@razzoozle/common/types/game"
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

export type QuestionTypeKey = QuestionType | "vokabelliste"

export type QuestionTypeCategory =
  "basic" | "survey" | "numeric" | "text" | "arrangement"

export interface QuestionTypeMeta {
  id: QuestionTypeKey
  icon: LucideIcon
  labelKey: string
  descKey: string
  category: QuestionTypeCategory
  requiresKlassen?: boolean
  isPseudoType?: boolean
}

export const TYPE_META: readonly QuestionTypeMeta[] = [
  {
    id: "choice",
    icon: CircleDot,
    labelKey: "quizz:type.choice",
    descKey: "quizz:type.choiceDesc",
    category: "basic",
  },
  {
    id: "boolean",
    icon: ToggleLeft,
    labelKey: "quizz:type.boolean",
    descKey: "quizz:type.booleanDesc",
    category: "basic",
  },
  {
    id: "multiple-select",
    icon: ListChecks,
    labelKey: "quizz:type.multipleSelect",
    descKey: "quizz:type.multipleSelectDesc",
    category: "basic",
  },
  {
    id: "poll",
    icon: BarChart3,
    labelKey: "quizz:type.poll",
    descKey: "quizz:type.pollDesc",
    category: "survey",
  },
  {
    id: "word-cloud",
    icon: Cloud,
    labelKey: "quizz:type.wordCloud",
    descKey: "quizz:type.wordCloudDesc",
    category: "survey",
  },
  {
    id: "brainstorm",
    icon: Lightbulb,
    labelKey: "quizz:type.brainstorm",
    descKey: "quizz:type.brainstormDesc",
    category: "survey",
  },
  {
    id: "confidence",
    icon: Gauge,
    labelKey: "quizz:type.confidence",
    descKey: "quizz:type.confidenceDesc",
    category: "survey",
  },
  {
    id: "micro-lesson",
    icon: GraduationCap,
    labelKey: "quizz:type.microLesson",
    descKey: "quizz:type.microLessonDesc",
    category: "survey",
  },
  {
    id: "slider",
    icon: SlidersHorizontal,
    labelKey: "quizz:type.slider",
    descKey: "quizz:type.sliderDesc",
    category: "numeric",
  },
  {
    id: "mathematik",
    icon: Calculator,
    labelKey: "quizz:type.mathematik",
    descKey: "quizz:type.mathematikDesc",
    category: "numeric",
    requiresKlassen: true,
  },
  {
    id: "type-answer",
    icon: Keyboard,
    labelKey: "quizz:type.typeAnswer",
    descKey: "quizz:type.typeAnswerDesc",
    category: "text",
  },
  {
    id: "fill-blank",
    icon: TextCursorInput,
    labelKey: "quizz:type.fillBlank",
    descKey: "quizz:type.fillBlankDesc",
    category: "text",
  },
  {
    id: "sentence-builder",
    icon: Blocks,
    labelKey: "quizz:type.sentenceBuilder",
    descKey: "quizz:type.sentenceBuilderDesc",
    category: "text",
  },
  {
    id: "wortarten",
    icon: Languages,
    labelKey: "quizz:type.wortarten",
    descKey: "quizz:type.wortartenDesc",
    category: "text",
    requiresKlassen: true,
  },
  {
    id: "vokabelliste",
    icon: BookOpen,
    labelKey: "quizz:type.vokabelliste",
    descKey: "quizz:type.vokabellisteDesc",
    category: "text",
    requiresKlassen: true,
    isPseudoType: true,
  },
  {
    id: "sequencing",
    icon: ListOrdered,
    labelKey: "quizz:type.sequencing",
    descKey: "quizz:type.sequencingDesc",
    category: "arrangement",
  },
  {
    id: "matching",
    icon: Link2,
    labelKey: "quizz:type.matching",
    descKey: "quizz:type.matchingDesc",
    category: "arrangement",
  },
  {
    id: "drop-pin",
    icon: MapPin,
    labelKey: "quizz:type.dropPin",
    descKey: "quizz:type.dropPinDesc",
    category: "arrangement",
  },
] as const

export const TYPE_META_BY_ID = Object.fromEntries(
  TYPE_META.map((meta) => [meta.id, meta]),
) as Record<QuestionTypeKey, QuestionTypeMeta>

export const TYPE_CATEGORIES: readonly {
  id: QuestionTypeCategory
  labelKey: string
}[] = [
  {
    id: "basic",
    labelKey: "quizz:typeCategory.basic",
  },
  {
    id: "survey",
    labelKey: "quizz:typeCategory.survey",
  },
  {
    id: "numeric",
    labelKey: "quizz:typeCategory.numeric",
  },
  {
    id: "text",
    labelKey: "quizz:typeCategory.text",
  },
  {
    id: "arrangement",
    labelKey: "quizz:typeCategory.arrangement",
  },
] as const
