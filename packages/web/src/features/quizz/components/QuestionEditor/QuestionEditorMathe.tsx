import { useQuizzEditor } from "@razzoozle/web/features/quizz/contexts/quizz-editor-context"
import FormSection from "../FormSection"
import { FormField } from "../FormField"
import { useTranslation } from "react-i18next"

export const QuestionEditorMathe = () => {
  const { currentQuestion, currentIndex, updateQuestion } = useQuizzEditor()
  const { t } = useTranslation()

  const updateField = (field: string, value: any) => {
    updateQuestion(currentIndex, { [field]: value })
  }

  return (
    <FormSection title={t("quizz:type.mathematik")}>
      <FormField
        label={t("quizz:mathematik.correct", "Correct answer")}
        type="number"
        step="0.01"
        value={currentQuestion.correct ?? 0}
        onChange={(e) =>
          updateField("correct", e.target.value === "" ? undefined : Number(e.target.value))
        }
      />
      <FormField
        label={t("quizz:mathematik.tolerance", "Tolerance")}
        type="number"
        step="0.01"
        value={currentQuestion.tolerance ?? 0.1}
        onChange={(e) =>
          updateField("tolerance", e.target.value === "" ? undefined : Number(e.target.value))
        }
      />
      <FormField
        label={t("quizz:mathematik.decimals", "Decimal places")}
        type="number"
        min="0"
        max="10"
        value={currentQuestion.decimals ?? 2}
        onChange={(e) =>
          updateField("decimals", e.target.value === "" ? undefined : Number(e.target.value))
        }
      />
    </FormSection>
  )
}
