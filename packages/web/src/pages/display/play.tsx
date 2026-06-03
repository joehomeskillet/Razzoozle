import { EVENTS } from "@razzia/common/constants"
import Loader from "@razzia/web/components/Loader"
import GameWrapper from "@razzia/web/features/game/components/GameWrapper"
import {
  socketClient,
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { useQuestionStore } from "@razzia/web/features/game/stores/question"
import {
  GAME_STATE_COMPONENTS_MANAGER,
  isKeyOf,
} from "@razzia/web/features/game/utils/constants"
import { createFileRoute, useSearch } from "@tanstack/react-router"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { z } from "zod"

// Fullscreen display "play" view.
//
// This mirrors the manager presentation (`/party/manager/$gameId` and the
// `/satellite/$gameId` kiosk) but is a PURE display: no skip/back/auto buttons,
// no player score bar, no navigation. We reuse GameWrapper with `manager` so the
// presentation chrome (background, question counter) matches the host screen,
// but we pass NO onNext/onBack handlers, so GameWrapper renders zero controls.
//
// The display is reached after pairing on `/display`; the gameId arrives as a
// search param. We reconnect to that game over the (already display-authed)
// socket and render whatever EVENTS.GAME.STATUS the server pushes, in realtime.

const searchSchema = z.object({
  gameId: z.coerce.string().optional(),
})

const DisplayPlayPage = () => {
  const { gameId: gameIdParam } = useSearch({ from: "/display/play" })
  const { socket } = useSocket()
  const { status, setGameId, setStatus, setPlayers, resetStatus } =
    useManagerStore()
  const { setQuestionStates } = useQuestionStore()
  const { t } = useTranslation()

  // Best-effort fullscreen for the beamer (kiosk Chromium already covers this).
  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {
      /* ignore: fullscreen needs a gesture outside kiosk mode */
    })
  }, [])

  // Join the paired game. We reconnect as a manager-equivalent display; the
  // socket was already authenticated during the display pairing handshake.
  useEvent("connect", () => {
    if (gameIdParam) {
      socket.emit(EVENTS.MANAGER.RECONNECT, { gameId: gameIdParam })
    }
  })

  // If we land here already connected (in-app navigation from /display), fire the
  // reconnect immediately rather than waiting for the next `connect` event.
  useEffect(() => {
    if (gameIdParam && socket.connected) {
      socket.emit(EVENTS.MANAGER.RECONNECT, { gameId: gameIdParam })
    }
  }, [socket, gameIdParam])

  useEvent(EVENTS.GAME.STATUS, ({ name, data }) => {
    if (name in GAME_STATE_COMPONENTS_MANAGER) {
      setStatus(name, data)
    }
  })

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

  // On a full game reset the display has no dashboard to return to; it simply
  // clears its state and keeps showing the idle/waiting screen.
  useEvent(EVENTS.GAME.RESET, () => {
    resetStatus()
    setQuestionStates(null)
  })

  const CurrentComponent =
    status && isKeyOf(GAME_STATE_COMPONENTS_MANAGER, status.name)
      ? GAME_STATE_COMPONENTS_MANAGER[status.name]
      : null

  // Idle screen between pairing and the first status push.
  if (!status) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-[3vh] text-center">
        <Loader className="h-[12vh]" />
        <p className="text-[3vh] font-bold text-white/80">
          {t("display:waitingForGame", {
            defaultValue: "Waiting for the game to start…",
          })}
        </p>
      </div>
    )
  }

  // GameWrapper with `manager` chrome but NO control handlers → a clean,
  // distraction-free presentation sized for a beamer/TV.
  return (
    <div className="display-stage h-full w-full">
      <GameWrapper statusName={status.name} manager>
        {CurrentComponent && <CurrentComponent data={status.data as never} />}
      </GameWrapper>
    </div>
  )
}

export const Route = createFileRoute("/display/play")({
  component: DisplayPlayPage,
  validateSearch: searchSchema,
  onLeave: ({ search }) => {
    const gameId = (search as { gameId?: string })?.gameId
    if (gameId) {
      socketClient.emit(EVENTS.MANAGER.LEAVE, { gameId })
    }
  },
})
