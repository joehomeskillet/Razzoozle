import background from "@razzia/web/assets/background.webp"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import QuestionEditorAcceptedAnswers from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorAcceptedAnswers"
import QuestionEditorAnswers from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorAnswers"
import QuestionEditorConfig from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorConfig"
import QuestionEditorMedia from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorMedia"
import QuestionEditorTitle from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorTitle"
import QuestionEditorType from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorType"
import { useThemeStore } from "@razzia/web/features/theme/store"

const QuestionEditor = () => {
  const { currentQuestion } = useQuizzEditor()
  const { theme } = useThemeStore()
  const isSlider = currentQuestion.type === "slider"
  const isTypeAnswer = currentQuestion.type === "type-answer"

  return (
    <div className="flex flex-1 overflow-hidden">
      <main className="mx-auto flex max-w-7xl flex-1 flex-col gap-4 overflow-y-auto p-6">
        <QuestionEditorTitle />
        <QuestionEditorType />
        <QuestionEditorMedia />
        {!isSlider && !isTypeAnswer && <QuestionEditorAnswers />}
        {isTypeAnswer && <QuestionEditorAcceptedAnswers />}

        <div className="fixed top-0 left-0 h-full w-full">
          <img
            className="pointer-events-none h-full w-full object-cover select-none"
            src={theme.backgrounds.auth ?? background}
            alt="background"
          />
        </div>
      </main>
      <QuestionEditorConfig />
    </div>
  )
}

export default QuestionEditor
