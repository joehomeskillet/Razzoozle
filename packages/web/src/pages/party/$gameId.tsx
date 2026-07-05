import { EVENTS } from "@razzoozle/common/constants"
import { STATUS } from "@razzoozle/common/types/game/status"
import Ended from "@razzoozle/web/features/game/components/states/Ended"
import GameWrapper from "@razzoozle/web/features/game/components/GameWrapper"
import PluginRenderSlot from "@razzoozle/web/features/game/components/PluginRenderSlot"
import {
  socketClient,
  useClockSync,
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { useAnswerStore } from "@razzoozle/web/features/game/stores/answer"
import { useLowLatencyStore } from "@razzoozle/web/features/game/stores/lowLatency"
import { usePlayerStore } from "@razzoozle/web/features/game/stores/player"
import { useQuestionStore } from "@razzoozle/web/features/game/stores/question"
import {
  GAME_STATE_COMPONENTS,
  isKeyOf,
} from "@razzoozle/web/features/game/utils/constants"
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router"
import { useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const PlayerGamePage = () => {
  const navigate = useNavigate()
  const { socket } = useSocket()
  const { gameId: gameIdParam } = useParams({ from: "/party/$gameId" })
  const { status, setPlayer, setGameId, setStatus, reset } = usePlayerStore()
  const { setQuestionStates, setDisplayOrder } = useQuestionStore()
  const setLowLatencyActive = useLowLatencyStore((s) => s.setActive)
  const setAlreadyAnswered = useAnswerStore((s) => s.setAlreadyAnswered)
  const { t } = useTranslation()

  // Drive UI-only clock sync while low-latency mode is active (no-op otherwise).
  useClockSync()

  // Last server sequence this client has seen, sent back on reconnect so the
  // server can detect a stale view. Defaults to undefined (normal mode / old
  // server simply ignores it). Held in a ref so updating it never re-renders.
  const lastServerSeqRef = useRef<number | undefined>(undefined)

  // The host leaving (server emits the existing EVENTS.GAME.RESET via
  // notifyManagerGone) should land the player on the explanatory Ended
  // screen rather than a silent redirect. Holds the forwarded i18n key so
  // Ended can adapt its copy; null => game still live.
  const [endedMessage, setEndedMessage] = useState<string | null>(null)

  useEvent("connect", () => {
    if (gameIdParam) {
      // Reuse the durable clientId (carried in the socket handshake auth) plus
      // the last server sequence so resume can show "answered" if appropriate.
      socket.emit(EVENTS.PLAYER.RECONNECT, {
        gameId: gameIdParam,
        playerToken: localStorage.getItem(`player_token:${gameIdParam}`) ?? undefined,
        lastServerSeq: lastServerSeqRef.current,
      })
    }
  })

  useEvent(
    EVENTS.PLAYER.SUCCESS_RECONNECT,
    ({
      gameId: reconnectGameId,
      status: reconnectStatus,
      player,
      currentQuestion,
      // OPTIONAL — absent in normal mode; default to false so we never crash and
      // never wrongly lock a player out of answering.
      alreadyAnswered,
    }) => {
      setGameId(reconnectGameId)
      setStatus(reconnectStatus.name, reconnectStatus.data)
      setPlayer(player)
      setQuestionStates(currentQuestion)
      // If the server says we already answered the current question, surface that
      // so the answer screen renders the answered/locked state instead of fresh
      // buttons. ?? false keeps normal-mode behaviour untouched.
      setAlreadyAnswered(reconnectGameId, alreadyAnswered ?? false)
    },
  )

  useEvent(EVENTS.GAME.STATUS, ({ name, data }) => {
    if (name in GAME_STATE_COMPONENTS) {
      // Capture displayOrder when a new question arrives for shuffled answers.
      if (name === STATUS.SHOW_QUESTION) {
        const questionData = data as {
          displayOrder?: number[]
        }
        setDisplayOrder(questionData?.displayOrder)
      }

      // Detect low-latency mode from the presence of server-timing anchors and
      // track the latest server sequence. All reads optional/guarded so a
      // normal-mode (anchor-less) payload is a no-op here.
      if (name === STATUS.SELECT_ANSWER) {
        const anchored = data as {
          serverSeq?: number
          serverNowMs?: number
          answerDeadlineAtServerMs?: number
        }

        if (
          typeof anchored?.serverNowMs === "number" ||
          typeof anchored?.answerDeadlineAtServerMs === "number"
        ) {
          setLowLatencyActive(true)
        }

        if (typeof anchored?.serverSeq === "number") {
          lastServerSeqRef.current = anchored.serverSeq
        }

        // A fresh question always clears any prior "already answered" lock.
        setAlreadyAnswered(gameIdParam, false)
      }

      setStatus(name, data)
    }
  })

  useEvent(EVENTS.GAME.RESET, (message) => {
    // Clear the live-game stores either way; the manager-gone signal is the
    // expected "host closed the room" case, so show the calm Ended view
    // instead of bouncing the player home with an error toast. Genuine error
    // resets (kicked / not-found / expired / duplicate host) still redirect.
    reset()
    setQuestionStates(null)

    if (message === "errors:game.managerDisconnected") {
      setEndedMessage(message)
      return
    }

    navigate({ to: "/" })
    toast.error(t(message))
  })

  if (!gameIdParam) {
    return null
  }

  const CurrentComponent =
    status && isKeyOf(GAME_STATE_COMPONENTS, status.name)
      ? GAME_STATE_COMPONENTS[status.name]
      : null

  // Host ended/left the room: render the explanatory Ended screen. Placed
  // before the `!status` guard so it survives the store reset above.
  if (endedMessage) {
    return (
      <GameWrapper statusName={undefined}>
        <Ended data={{ message: endedMessage }} />
      </GameWrapper>
    )
  }

  if (!status) {
    return null
  }

  return (
    <GameWrapper statusName={status.name}>
      {CurrentComponent && <CurrentComponent data={status.data as never} />}
      {CurrentComponent && <PluginRenderSlot status={status.name} data={status.data} />}
    </GameWrapper>
  )
}

export const Route = createFileRoute("/party/$gameId")({
  component: PlayerGamePage,
  onLeave: ({ params: { gameId } }) => {
    socketClient.emit(EVENTS.PLAYER.LEAVE, { gameId })
  },
})
