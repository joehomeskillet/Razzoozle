import { EVENTS } from "@razzoozle/common/constants"
import type { QuizzWithId } from "@razzoozle/common/types/game"
import Loader from "@razzoozle/web/components/Loader"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import QuizzEditorShell from "@razzoozle/web/features/quizz/components/QuizzEditorShell"
import { QuizzEditorProvider } from "@razzoozle/web/features/quizz/contexts/quizz-editor-context"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"

const QuizzEditPage = () => {
  const { quizzId } = Route.useParams()
  const { socket } = useSocket()
  const [quizz, setQuizz] = useState<QuizzWithId | null>(null)

  useEffect(() => {
    socket.emit(EVENTS.QUIZZ.GET, quizzId)
  }, [socket, quizzId])

  useEvent(EVENTS.QUIZZ.DATA, (data) => {
    if (data.id === quizzId) {
      setQuizz(data)
    }
  })

  if (!quizz) {
    return (
      <div className="flex h-svh items-center justify-center bg-gray-50">
        <Loader className="text-background max-h-23" />
      </div>
    )
  }

  return (
    <QuizzEditorProvider initialData={quizz}>
      <QuizzEditorShell />
    </QuizzEditorProvider>
  )
}

export const Route = createFileRoute("/manager/quizz/$quizzId")({
  component: QuizzEditPage,
})
