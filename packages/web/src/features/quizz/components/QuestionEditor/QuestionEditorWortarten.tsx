import { useQuizzEditor } from "@razzoozle/web/features/quizz/contexts/quizz-editor-context"
import FormSection from "../FormSection"
import { FormField } from "../FormField"
import { useTranslation } from "react-i18next"

export const QuestionEditorWortarten = () => {
  const { currentQuestion, currentIndex, updateQuestion } = useQuizzEditor()
  const { t } = useTranslation()

  const updateField = (field: string, value: any) => {
    updateQuestion(currentIndex, { [field]: value })
  }

  return (
    <FormSection title={t("quizz:type.wortarten")}>
      <FormField
        label={t("quizz:wortarten.sentence", "Sentence")}
        type="textarea"
        value={currentQuestion.sentence ?? ""}
        onChange={(e) => updateField("sentence", e.target.value)}
        placeholder="Enter the sentence for parts-of-speech tagging..."
      />
      <p className="text-sm text-gray-600 mt-2">
        {t("quizz:wortarten.note", "Token splitting and POS assignment will be configured in the next step.")}
      </p>
    </FormSection>
  )
}
