import type { Question } from "@razzoozle/common/types/game"
import QuestionMedia from "@razzoozle/web/components/QuestionMedia"
import {
  ANSWERS_COLORS,
  ANSWERS_LABELS,
} from "@razzoozle/web/features/game/utils/constants"
import clsx from "clsx"
import { Check, Clock, Timer } from "lucide-react"
import { useTranslation } from "react-i18next"

// Map the question kind to the existing quizz editor type-label keys so the
// preview names the type with the same wording the editor uses.
const TYPE_LABEL_KEY: Record<string, string> = {
  choice: "quizz:type.choice",
  boolean: "quizz:type.boolean",
  slider: "quizz:type.slider",
  poll: "quizz:type.poll",
  "multiple-select": "quizz:type.multipleSelect",
  "type-answer": "quizz:type.typeAnswer",
}

// Read-only render of the full question for the moderator to vet correctness.
// Manager-auth only — showing the solution(s) is intended here.
export const QuestionPreview = ({ question }: { question: Question }) => {
  const { t } = useTranslation()

  const type = question.type ?? "choice"
  const isPoll = type === "poll"
  const isSlider = type === "slider"
  const isTypeAnswer = type === "type-answer"
  const solutions = question.solutions ?? []
  const unit = question.unit ? ` ${question.unit}` : ""

  return (
    <div className="mt-3 space-y-3 rounded-lg bg-[var(--surface-2)] p-3">
      {/* Type badge */}
      <span className="inline-flex items-center rounded-full bg-[var(--surface-4)] px-2.5 py-0.5 text-xs font-semibold text-[var(--ink-muted)]">
        {t(TYPE_LABEL_KEY[type] ?? "quizz:type.choice")}
      </span>

      <p className="font-semibold text-[var(--ink)]">{question.question}</p>

      {question.media && (
        <div className="flex justify-start">
          <QuestionMedia media={question.media} alt={question.question} />
        </div>
      )}

      {/* Choice / boolean / poll / multiple-select: answer grid with the
          correct option(s) highlighted. Poll has no correct answer. */}
      {!isSlider && !isTypeAnswer && (question.answers?.length ?? 0) > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {(question.answers ?? []).map((answer, ai) => {
            const correct = solutions.includes(ai)

            return (
              <div
                key={ai}
                className={clsx(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
                  ANSWERS_COLORS[ai % ANSWERS_COLORS.length],
                  correct
                    ? "outline-2 -outline-offset-2 outline-green-600"
                    : "opacity-90",
                )}
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-black/20 text-xs font-bold">
                  {ANSWERS_LABELS[ai % ANSWERS_LABELS.length]}
                </span>
                <span className="min-w-0 flex-1 break-words">{answer}</span>
                {!isPoll && correct && (
                  <Check className="size-5 shrink-0" aria-hidden />
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Type-answer: accepted-answers legend */}
      {isTypeAnswer && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold tracking-wide text-[var(--ink-subtle)] uppercase">
            {t("quizz:typeAnswer.acceptedAnswersLabel")}
          </p>
          <div className="flex flex-wrap gap-2">
            {(question.acceptedAnswers ?? []).map((a) => (
              <span
                key={a}
                className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700"
              >
                {a}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Slider: min / max / correct */}
      {isSlider && (
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="rounded-lg bg-white px-3 py-1.5 text-[var(--ink-muted)] outline-1 -outline-offset-1 outline-gray-200">
            {t("quizz:slider.min")}: {question.min}
            {unit}
          </span>
          <span className="rounded-lg bg-white px-3 py-1.5 text-[var(--ink-muted)] outline-1 -outline-offset-1 outline-gray-200">
            {t("quizz:slider.max")}: {question.max}
            {unit}
          </span>
          <span className="rounded-lg bg-green-100 px-3 py-1.5 font-semibold text-green-700">
            {t("manager:result.slider.correctAnswer")} {question.correct}
            {unit}
          </span>
        </div>
      )}

      {/* Timing */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--ink-subtle)]">
        <span className="flex items-center gap-1.5">
          <Clock className="size-3.5" aria-hidden />
          {question.time}
          {t("manager:result.timeLimitSuffix")}
        </span>
        <span className="flex items-center gap-1.5">
          <Timer className="size-3.5" aria-hidden />
          {t("manager:submissions.previewLabels.cooldown")}: {question.cooldown}
          {t("manager:submissions.cooldownSuffix", { defaultValue: "s" })}
        </span>
      </div>
    </div>
  )
}
