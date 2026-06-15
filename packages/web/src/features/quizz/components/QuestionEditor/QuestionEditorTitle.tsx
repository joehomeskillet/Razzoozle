import Markdown from "@razzoozle/web/components/Markdown"
import { useQuizzEditor } from "@razzoozle/web/features/quizz/contexts/quizz-editor-context"
import type { ChangeEvent } from "react"
import { useTranslation } from "react-i18next"

const QuestionEditorTitle = () => {
  const { updateQuestion, currentIndex, currentQuestion } = useQuizzEditor()
  const { t } = useTranslation()

  const handleChangeQuestion = (e: ChangeEvent<HTMLInputElement>) => {
    updateQuestion(currentIndex, { question: e.target.value })
  }

  return (
    <div className="focus-within:outline-primary z-10 rounded-2xl bg-white shadow-sm focus-within:outline-2 focus-within:-outline-offset-2">
      <input
        className="min-h-12 w-full resize-none rounded-2xl p-4 text-center text-xl font-semibold text-gray-800 outline-none placeholder:text-gray-400"
        placeholder={t("quizz:question.placeholder")}
        aria-label={t("quizz:question.inputLabel")}
        value={currentQuestion.question}
        onChange={handleChangeQuestion}
      />
      {currentQuestion.question.trim() !== "" && (
        <div className="px-4 pb-3 text-center text-sm text-gray-500">
          <Markdown>{currentQuestion.question}</Markdown>
        </div>
      )}
    </div>
  )
}

export default QuestionEditorTitle
