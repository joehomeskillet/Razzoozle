import { AI } from "@razzoozle/common/constants"
import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import Badge from "@razzoozle/web/components/manager/Badge"
import { SectionCard } from "@razzoozle/web/features/manager/components/console"
import { LabelRow } from "@razzoozle/web/components/ui"
import { CheckCircle2, Sparkles } from "lucide-react"
import type { TFunction } from "i18next"
import type { Dispatch, SetStateAction } from "react"
import { clampQuizCount } from "./helpers"

interface QuizGenSectionProps {
  t: TFunction
  topic: string
  count: number
  generating: boolean
  generated: boolean
  textConfigured: boolean
  setTopic: Dispatch<SetStateAction<string>>
  setCount: Dispatch<SetStateAction<number>>
  generateQuiz: () => void
}

const QuizGenSection = ({
  t,
  topic,
  count,
  generating,
  generated,
  textConfigured,
  setTopic,
  setCount,
  generateQuiz,
}: QuizGenSectionProps) => {
  return (
    <SectionCard
      icon={<Sparkles className="size-5" aria-hidden />}
      title={t("manager:ai.generate.quizTitle")}
    >
      <div className="space-y-4">
        <LabelRow
          label={t("manager:ai.generate.topic")}
          htmlFor="ai-quiz-topic"
        >
          <Input
            id="ai-quiz-topic"
            value={topic}
            maxLength={AI.TOPIC_MAX_LEN}
            placeholder={t("manager:ai.generate.topicPlaceholder")}
            onChange={(event) => setTopic(event.target.value)}
            className="w-full"
          />
        </LabelRow>

        <LabelRow
          label={t("manager:ai.generate.countValue", {
            defaultValue: "Fragen: {{count}}",
            count,
          })}
          htmlFor="ai-quiz-count"
        >
          <div className="flex items-center gap-3">
            <input
              id="ai-quiz-count"
              type="range"
              min={AI.QUIZ_MIN_QUESTIONS}
              max={AI.QUIZ_MAX_QUESTIONS}
              step={1}
              value={count}
              aria-valuetext={t("manager:ai.generate.countValue", {
                defaultValue: "Fragen: {{count}}",
                count,
              })}
              onChange={(event) =>
                setCount(clampQuizCount(Number(event.target.value)))
              }
              className="h-11 w-full cursor-pointer accent-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
            />
            <span className="w-8 shrink-0 text-right text-lg font-bold tabular-nums text-[var(--ink)]">
              {count}
            </span>
          </div>
        </LabelRow>
      </div>

      <Button
        type="button"
        onClick={generateQuiz}
        disabled={!topic.trim() || generating || !textConfigured}
      >
        {generating
          ? t("manager:ai.generate.generating")
          : t("manager:ai.generate.quiz")}
      </Button>

      <div aria-live="polite" className="min-h-5">
        {generating && (
          <p className="text-sm text-[var(--ink-subtle)]">
            {t("manager:ai.generate.generating")}
          </p>
        )}
        {!generating && !textConfigured && (
          <p className="text-sm text-[var(--ink-subtle)]">
            {t("manager:ai.generate.notConfigured")}
          </p>
        )}
        {!generating && generated && (
          <Badge className="flex-wrap gap-1.5 py-1 bg-[var(--status-online-bg)] text-[var(--status-online-text)]">
            <CheckCircle2 className="size-3.5" aria-hidden />
            {t("manager:ai.generate.generated")}
            <span className="font-medium text-[var(--status-online-text)]">
              {t("manager:ai.generate.openInEditor")}
            </span>
          </Badge>
        )}
      </div>
    </SectionCard>
  )
}

export default QuizGenSection
