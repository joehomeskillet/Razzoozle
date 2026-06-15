import { EVENTS } from "@razzoozle/common/constants"
import { STATUS } from "@razzoozle/common/types/game/status"
import GameWrapper from "@razzoozle/web/features/game/components/GameWrapper"
import {
  socketClient,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { useManagerGameSession } from "@razzoozle/web/features/game/hooks/useManagerGameSession"
import { useManagerStore } from "@razzoozle/web/features/game/stores/manager"
import { useQuestionStore } from "@razzoozle/web/features/game/stores/question"
import {
  MANAGER_SKIP_EVENTS,
  isKeyOf,
} from "@razzoozle/web/features/game/utils/constants"
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const ManagerGamePage = () => {
  const navigate = useNavigate()
  const { gameId: gameIdParam } = useParams({ from: "/party/manager/$gameId" })
  const { socket } = useSocket()
  const { gameId, reset } = useManagerStore()
  const { setQuestionStates } = useQuestionStore()
  const { t } = useTranslation()

  const { status, CurrentComponent } = useManagerGameSession(gameIdParam, {
    onReset: (message) => {
      navigate({ to: "/manager/config" })
      reset()
      setQuestionStates(null)
      toast.error(t(message))
    },
  })

  const handleSkip = () => {
    if (!status) {
      return
    }

    if (status.name === STATUS.FINISHED) {
      navigate({ to: "/manager/config" })
      reset()
      setQuestionStates(null)

      return
    }

    if (!gameId) {
      return
    }

    if (isKeyOf(MANAGER_SKIP_EVENTS, status.name)) {
      socket.emit(MANAGER_SKIP_EVENTS[status.name], { gameId })
    }
  }

  const handleBack = () => {
    navigate({ to: "/manager/config" })
    reset()
    setQuestionStates(null)
  }

  if (!status) {
    return null
  }

  return (
    <GameWrapper
      statusName={status.name}
      onNext={handleSkip}
      onBack={status.name === STATUS.SHOW_ROOM ? handleBack : undefined}
      manager
    >
      {CurrentComponent && <CurrentComponent data={status.data as never} />}
    </GameWrapper>
  )
}

export const Route = createFileRoute("/party/manager/$gameId")({
  component: ManagerGamePage,
  onLeave: ({ params: { gameId } }) => {
    socketClient.emit(EVENTS.MANAGER.LEAVE, { gameId })
  },
})
