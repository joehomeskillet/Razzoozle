import QuizzEditorShell from "@razzoozle/web/features/quizz/components/QuizzEditorShell"
import { QuizzEditorProvider } from "@razzoozle/web/features/quizz/contexts/quizz-editor-context"
import { createFileRoute } from "@tanstack/react-router"

const QuizzEditorPage = () => (
  <QuizzEditorProvider>
    <QuizzEditorShell />
  </QuizzEditorProvider>
)

export const Route = createFileRoute("/manager/quizz/")({
  component: QuizzEditorPage,
})
