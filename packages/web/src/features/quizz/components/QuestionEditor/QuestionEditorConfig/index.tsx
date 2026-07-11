import ConfigField from "@razzoozle/web/features/quizz/components/QuestionEditor/QuestionEditorConfig/ConfigField"
import ConfigNumberInput from "@razzoozle/web/features/quizz/components/QuestionEditor/QuestionEditorConfig/ConfigNumberInput"
import ConfigSection from "@razzoozle/web/features/quizz/components/QuestionEditor/QuestionEditorConfig/ConfigSection"
import QuestionEditorAIAssist from "@razzoozle/web/features/quizz/components/QuestionEditorAIAssist"
import { useQuizzEditor } from "@razzoozle/web/features/quizz/contexts/quizz-editor-context"
import { Clock, Timer } from "lucide-react"
import { useTranslation } from "react-i18next"

// Mirror the authoritative server bounds (packages/common quizz validator:
// cooldown 3–15, time 5–120) so the editor clamps before save and never
// produces a value the backend would reject.
const COOLDOWN_MIN = 3
const COOLDOWN_MAX = 15
const TIME_MIN = 5
const TIME_MAX = 120

const QuestionEditorConfig = () => {
  const { currentQuestion, currentIndex, updateQuestion } = useQuizzEditor()
  const { t } = useTranslation()

  const handleUpdateQuestion = (key: string) => (value: string | number) => {
    updateQuestion(currentIndex, { [key]: value })
  }

  return (
    <aside className="z-10 m-4 flex shrink-0 flex-col gap-6 self-start overflow-visible rounded-2xl bg-white p-4 shadow-sm xl:mt-6 xl:w-72 xl:overflow-auto">
      <ConfigSection title={t("quizz:question.config.timings")}>
        <ConfigField>
          <ConfigField.Label
            icon={<Clock className="size-4" />}
            label={t("quizz:question.config.questionDisplay")}
          />
          <ConfigNumberInput
            value={currentQuestion.cooldown}
            min={COOLDOWN_MIN}
            max={COOLDOWN_MAX}
            onChange={handleUpdateQuestion("cooldown")}
          />
          <ConfigField.Description>
            {t("quizz:question.config.questionDisplayHint", {
              defaultValue: "Dauer bevor Antworten erscheinen ({{min}}–{{max}} Sek.).",
              min: COOLDOWN_MIN,
              max: COOLDOWN_MAX,
            })}
          </ConfigField.Description>
        </ConfigField>

        <ConfigField>
          <ConfigField.Label
            icon={<Timer className="size-4" />}
            label={t("quizz:question.config.answerTime")}
          />
          <ConfigNumberInput
            value={currentQuestion.time}
            min={TIME_MIN}
            max={TIME_MAX}
            onChange={handleUpdateQuestion("time")}
          />
          <ConfigField.Description>
            {t("quizz:question.config.answerTimeHint", {
              defaultValue: "Zeit, die Spieler zum Antworten haben ({{min}}–{{max}} Sek.).",
              min: TIME_MIN,
              max: TIME_MAX,
            })}
          </ConfigField.Description>
        </ConfigField>
      </ConfigSection>

      <QuestionEditorAIAssist />
    </aside>
  )
}

export default QuestionEditorConfig
