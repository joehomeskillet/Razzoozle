import { useQuizzEditor } from "@razzoozle/web/features/quizz/contexts/quizz-editor-context"
import { useTranslation } from "react-i18next"

const QuestionEditorWortarten = () => {
  const { currentQuestion, currentIndex, updateQuestion } = useQuizzEditor()
  const { t } = useTranslation()

  const sentence = currentQuestion.sentence ?? ""

  const handleSentenceChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateQuestion(currentIndex, { sentence: e.target.value })
  }

  return (
    <div className="z-10 flex flex-col gap-4 rounded-xl bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3">
        <label className="text-sm font-semibold text-gray-700">
          {t("quizz:wortarten.sentence", "Sentence")}
        </label>
        <textarea
          value={sentence}
          onChange={handleSentenceChange}
          placeholder={t("quizz:wortarten.sentencePlaceholder", "Enter the sentence for parts-of-speech tagging...")}
          className="rounded-lg border border-[var(--border-hairline)] bg-white px-3 py-2 text-gray-800 outline-none placeholder:text-gray-400 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
          rows={3}
        />
      </div>

      <p className="text-sm text-gray-600">
        {t("quizz:wortarten.note", "Token splitting and POS assignment will be configured in the next step.")}
      </p>
    </div>
  )
}

export default QuestionEditorWortarten
