import AlertDialog from "@razzoozle/web/components/AlertDialog"
import ConfigField from "@razzoozle/web/features/quizz/components/QuestionEditor/QuestionEditorConfig/ConfigField"
import ConfigNumberInput from "@razzoozle/web/features/quizz/components/QuestionEditor/QuestionEditorConfig/ConfigNumberInput"
import ConfigSection from "@razzoozle/web/features/quizz/components/QuestionEditor/QuestionEditorConfig/ConfigSection"
import QuestionEditorAIAssist from "@razzoozle/web/features/quizz/components/QuestionEditorAIAssist"
import { QuestionTypeSelector } from "@razzoozle/web/features/quizz/components/QuestionTypeSelector"
import { useQuizzEditor } from "@razzoozle/web/features/quizz/contexts/quizz-editor-context"
import {
  buildTypePatch,
  getClearedNonEmptyFields,
} from "@razzoozle/web/features/quizz/questionTypeTransition"
import { Clock, Timer } from "lucide-react"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type { QuestionTypeKey } from "@razzoozle/web/lib/questionTypeMeta"

// Mirror the authoritative server bounds (packages/common quizz validator:
// cooldown 3–15, time 5–120) so the editor clamps before save and never
// produces a value the backend would reject.
const COOLDOWN_MIN = 3
const COOLDOWN_MAX = 15
const TIME_MIN = 5
const TIME_MAX = 120

const SLIDER_FIELDS: Array<{
  field: "min" | "max" | "correct" | "step"
  labelKey: string
}> = [
  { field: "min", labelKey: "quizz:slider.min" },
  { field: "max", labelKey: "quizz:slider.max" },
  { field: "correct", labelKey: "quizz:slider.correct" },
  { field: "step", labelKey: "quizz:slider.step" },
]

/**
 * Map field names to user-friendly i18n labels for the confirmation dialog.
 */
const FIELD_LABELS: Record<string, string> = {
  solutions: "quizz:typechange.fieldLabels.solutions",
  answers: "quizz:typechange.fieldLabels.answers",
  bonus: "quizz:typechange.fieldLabels.bonus",
  acceptedAnswers: "quizz:typechange.fieldLabels.acceptedAnswers",
  matchMode: "quizz:typechange.fieldLabels.matchMode",
  chunks: "quizz:typechange.fieldLabels.chunks",
  items: "quizz:typechange.fieldLabels.items",
  correctOrder: "quizz:typechange.fieldLabels.correctOrder",
  segments: "quizz:typechange.fieldLabels.segments",
  slots: "quizz:typechange.fieldLabels.slots",
  leftItems: "quizz:typechange.fieldLabels.leftItems",
  hotspots: "quizz:typechange.fieldLabels.hotspots",
  min: "quizz:typechange.fieldLabels.min",
  max: "quizz:typechange.fieldLabels.max",
  correct: "quizz:typechange.fieldLabels.correct",
  step: "quizz:typechange.fieldLabels.step",
  unit: "quizz:typechange.fieldLabels.unit",
  sentence: "quizz:typechange.fieldLabels.sentence",
  tokens: "quizz:typechange.fieldLabels.tokens",
  posSet: "quizz:typechange.fieldLabels.posSet",
  tolerance: "quizz:typechange.fieldLabels.tolerance",
  decimals: "quizz:typechange.fieldLabels.decimals",
}

const QuestionEditorConfig = () => {
  const { currentQuestion, currentIndex, updateQuestion } = useQuizzEditor()
  const { t } = useTranslation()

  const [dialogOpen, setDialogOpen] = useState(false)
  const pendingTypeRef = useRef<QuestionTypeKey | null>(null)

  const handleUpdateQuestion = (key: string) => (value: string | number) => {
    updateQuestion(currentIndex, { [key]: value })
  }

  const handleTypeChange = (next: QuestionTypeKey) => {
    const patch = buildTypePatch(currentQuestion, next)
    const cleared = getClearedNonEmptyFields(currentQuestion, patch)

    if (cleared.length === 0) {
      // Non-destructive transition: apply immediately without dialog
      updateQuestion(currentIndex, patch)
    } else {
      // Destructive transition: show confirmation dialog
      pendingTypeRef.current = next
      setDialogOpen(true)
    }
  }

  const handleConfirmTypeChange = () => {
    if (pendingTypeRef.current) {
      const patch = buildTypePatch(currentQuestion, pendingTypeRef.current)
      updateQuestion(currentIndex, patch)
      pendingTypeRef.current = null
      setDialogOpen(false)
    }
  }

  const getDialogDescription = (): string => {
    if (!pendingTypeRef.current) return ""

    const patch = buildTypePatch(currentQuestion, pendingTypeRef.current)
    const cleared = getClearedNonEmptyFields(currentQuestion, patch)

    if (cleared.length === 0) {
      return t("quizz:typechange.genericWarning", {
        defaultValue: "Einige eingegebene Inhalte gehen bei diesem Wechsel verloren.",
      })
    }

    // Build list of field labels
    const labels = cleared
      .map((field) => {
        const labelKey = FIELD_LABELS[field]
        return labelKey
          ? t(labelKey, { defaultValue: field })
          : field
      })
      .join(", ")

    return t("quizz:typechange.fieldLossWarning", {
      defaultValue: `Folgende Felder werden gelöscht: ${labels}`,
      fields: labels,
    })
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

  const currentType = (currentQuestion.type ?? "choice") as QuestionTypeKey

  return (
    <aside className="z-10 m-4 flex shrink-0 flex-col gap-6 self-start overflow-visible rounded-2xl bg-white p-4 shadow-sm xl:mt-6 xl:w-72 xl:overflow-auto">
      {/* Type Change Confirmation Dialog */}
      <AlertDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={t("quizz:typechange.confirmTitle", {
          defaultValue: "Fragetyp wechseln?",
        })}
        description={getDialogDescription()}
        confirmLabel={t("quizz:typechange.confirmButton", {
          defaultValue: "Wechsel bestätigen",
        })}
        onConfirm={handleConfirmTypeChange}
      />

      {/* Fragetyp Section */}
      <ConfigSection title={t("quizz:question.config.questionType", { defaultValue: "Fragetyp" })}>
        <QuestionTypeSelector
          currentType={currentType}
          onTypeChange={handleTypeChange}
        />
      </ConfigSection>

      {/* Timings Section */}
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

      {/* Options Section */}
      <ConfigSection title={t("quizz:question.config.options", { defaultValue: "Optionen" })}>
        {currentType === "slider" && (
          <div className="flex flex-col gap-4 pb-4 border-b border-[var(--line)]">
            <div className="grid gap-4 grid-cols-2">
              {SLIDER_FIELDS.map(({ field, labelKey }) => (
                <label key={field} className="flex flex-col gap-2">
                  <span className="text-xs font-semibold text-[var(--ink-muted)]">
                    {t(labelKey)}
                  </span>
                  <input
                    type="number"
                    value={currentQuestion[field] ?? ""}
                    onChange={setNum(field)}
                    className="h-8 rounded-md border border-[var(--line)] px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-muted)]"
                  />
                </label>
              ))}
              <label className="flex flex-col gap-2 col-span-2">
                <span className="text-xs font-semibold text-[var(--ink-muted)]">
                  {t("quizz:slider.unit")}
                </span>
                <input
                  type="text"
                  value={currentQuestion.unit ?? ""}
                  onChange={setUnit}
                  placeholder={t("quizz:slider.unitPlaceholder")}
                  className="h-8 rounded-md border border-[var(--line)] px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-muted)]"
                />
              </label>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={currentQuestion.bonus ?? false}
              onChange={toggleBonus}
              className="h-4 w-4 rounded border-[var(--line)] accent-[var(--ink-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-muted)]"
            />
            <span className="text-sm font-semibold text-[var(--ink)]">
              {t("quizz:type.bonusQuestion")}
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={currentQuestion.practice ?? false}
              onChange={togglePractice}
              className="h-4 w-4 rounded border-[var(--line)] accent-[var(--ink-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-muted)]"
            />
            <span className="text-sm font-semibold text-[var(--ink)]">
              {t("quizz:type.practiceQuestion")}
            </span>
          </label>
        </div>
      </ConfigSection>

      {/* AI-Assist Section */}
      <QuestionEditorAIAssist />
    </aside>
  )
}

export default QuestionEditorConfig
