import { EVENTS } from "@razzia/common/constants"
import { useEvent, useSocket } from "@razzia/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { useQuestionStore } from "@razzia/web/features/game/stores/question"
import {
  GAME_STATE_COMPONENTS_MANAGER,
  isKeyOf,
} from "@razzia/web/features/game/utils/constants"
import { useEffect } from "react"

interface ManagerGameSessionOptions {
  // Extra work run inside the `connect` handler before the MANAGER.RECONNECT
  // emit (the satellite kiosk uses this to attach + send its auth token).
  onConnect?: () => void
  // What to do when the server pushes a full GAME.RESET. Defaults to clearing
  // the in-memory status + question state (the pure-display behaviour). The
  // host route overrides this to navigate back to its dashboard.
  onReset?: (_message: string) => void
  // When true, also fire MANAGER.RECONNECT immediately on mount if the socket
  // is already connected (in-app navigation that skips a fresh `connect`).
  reconnectIfConnected?: boolean
}

// useManagerGameSession — shared socket wiring for the three manager-presentation
// routes (the host's /party/manager/$gameId, the /satellite/$gameId kiosk, and
// the /display/play beamer view). They all subscribe to the same GAME.STATUS /
// MANAGER.SUCCESS_RECONNECT / GAME.RESET surface, reconnect to the game on
// `connect`, and resolve the current state component the same way. The routes
// differ only in their control handlers (skip/back) and reset behaviour, which
// stay in the routes; this hook owns the common subscriptions and the
// `CurrentComponent` lookup.
export const useManagerGameSession = (
  gameId: string | undefined,
  options: ManagerGameSessionOptions = {},
) => {
  const { onConnect, onReset, reconnectIfConnected } = options
  const { socket } = useSocket()
  const { status, setGameId, setStatus, setPlayers, resetStatus } =
    useManagerStore()
  const { setQuestionStates } = useQuestionStore()

  useEvent(EVENTS.GAME.STATUS, ({ name, data }) => {
    if (name in GAME_STATE_COMPONENTS_MANAGER) {
      setStatus(name, data)
    }
  })

  useEvent("connect", () => {
    onConnect?.()
    if (gameId) {
      socket.emit(EVENTS.MANAGER.RECONNECT, { gameId })
    }
  })

  // If we land here already connected (in-app navigation), reconnect right away
  // instead of waiting for the next `connect` event.
  useEffect(() => {
    if (reconnectIfConnected && gameId && socket.connected) {
      socket.emit(EVENTS.MANAGER.RECONNECT, { gameId })
    }
  }, [reconnectIfConnected, socket, gameId])

  useEvent(
    EVENTS.MANAGER.SUCCESS_RECONNECT,
    ({
      gameId: reconnectGameId,
      status: reconnectStatus,
      players,
      currentQuestion,
    }) => {
      setGameId(reconnectGameId)
      setStatus(reconnectStatus.name, reconnectStatus.data)
      setPlayers(players)
      setQuestionStates(currentQuestion)
    },
  )

  useEvent(EVENTS.GAME.RESET, (message) => {
    if (onReset) {
      onReset(message)

      return
    }

    resetStatus()
    setQuestionStates(null)
  })

  const CurrentComponent =
    status && isKeyOf(GAME_STATE_COMPONENTS_MANAGER, status.name)
      ? GAME_STATE_COMPONENTS_MANAGER[status.name]
      : null

  return { status, CurrentComponent }
}
