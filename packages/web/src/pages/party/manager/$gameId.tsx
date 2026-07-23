import * as AlertDialog from "@radix-ui/react-alert-dialog"
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
import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

// Auto-advance countdown overlay. Reads the OPTIONAL `autoAdvanceMs` deadline
// the socket WP now folds into the SHOW_RESULT / SHOW_LEADERBOARD screen
// payloads, anchors a client-only local countdown to it, and renders a small
// progress pill. Absent field (manual mode / old server) => renders nothing.
const AutoAdvanceCountdown = ({ ms }: { ms: number | undefined }) => {
  const { t } = useTranslation()
  const [remaining, setRemaining] = useState(ms ?? 0)

  useEffect(() => {
    if (typeof ms !== "number" || ms <= 0) {
      return
    }

    // Anchor to wall-clock so the bar stays accurate even if a render is missed.
    const deadline = Date.now() + ms
    setRemaining(ms)

    const id = window.setInterval(() => {
      const left = deadline - Date.now()
      setRemaining(left > 0 ? left : 0)

      if (left <= 0) {
        window.clearInterval(id)
      }
    }, 100)

    return () => window.clearInterval(id)
  }, [ms])

  if (typeof ms !== "number" || ms <= 0) {
    return null
  }

  const seconds = Math.ceil(remaining / 1000)
  const pct = Math.max(0, Math.min(100, (remaining / ms) * 100))

  return (
    <div className="pointer-events-none absolute top-20 left-4 z-30">
      <div className="flex min-w-48 flex-col items-center gap-1 rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-white px-4 py-2 shadow-md">
        <span className="text-sm font-semibold text-[color:var(--color-field-ink)] tabular-nums">
          {t("manager:auto.nextIn", {
            seconds,
            defaultValue: "Weiter in {{seconds}}s",
          })}
        </span>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--color-field-ink)]/10"
          role="progressbar"
          aria-label={t("manager:auto.countdownLabel", {
            defaultValue: "Auto-advance countdown",
          })}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
        >
          <div
            className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-100 ease-linear"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  )
}

const ManagerGamePage = () => {
  const navigate = useNavigate()
  const { gameId: gameIdParam } = useParams({ from: "/party/manager/$gameId" })
  const { socket } = useSocket()
  const { gameId, reset } = useManagerStore()
  const { setQuestionStates } = useQuestionStore()
  const { t } = useTranslation()
  const [confirmExit, setConfirmExit] = useState(false)

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

  // Performs the actual leave once the host confirms. The route's `onLeave`
  // hook still emits MANAGER.LEAVE on the navigation triggered here (and on any
  // other navigation away), so this just clears local state + routes back.
  const performExit = () => {
    navigate({ to: "/manager/config" })
    reset()
    setQuestionStates(null)
  }

  if (!status) {
    return null
  }

  // The socket WP attaches `autoAdvanceMs` to the SHOW_RESULT / SHOW_LEADERBOARD
  // screen payloads while auto-mode is armed. Read it loosely so manual-mode /
  // older payloads (no such field) simply yield undefined and render nothing.
  const autoAdvanceMs = (status.data as { autoAdvanceMs?: number })
    ?.autoAdvanceMs

  return (
    <GameWrapper
      statusName={status.name}
      onNext={handleSkip}
      // Exit (LogOut) button opens the confirm dialog instead of leaving
      // immediately; performExit runs after the host confirms.
      onBack={() => setConfirmExit(true)}
      manager
    >
      <AutoAdvanceCountdown ms={autoAdvanceMs} />
      {CurrentComponent && <CurrentComponent data={status.data as never} />}

      <AlertDialog.Root open={confirmExit} onOpenChange={setConfirmExit}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
          <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 w-[min(90vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-theme)] bg-white p-6 shadow-xl">
            <AlertDialog.Title className="text-xl font-bold text-gray-900">
              {t("manager:exit.title", {
                defaultValue: "Spiel wirklich beenden?",
              })}
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-base text-gray-600">
              {t("manager:exit.description", {
                defaultValue:
                  "Alle Spieler werden benachrichtigt und das Spiel wird beendet.",
              })}
            </AlertDialog.Description>
            <div className="mt-6 flex justify-end gap-3">
              <AlertDialog.Cancel className="focus-visible:ring-primary/60 min-h-11 rounded-[var(--radius-theme)] px-4 py-2 text-base font-semibold text-gray-700 hover:bg-gray-100 focus-visible:ring-2 focus-visible:outline-none">
                {t("common:cancel", { defaultValue: "Abbrechen" })}
              </AlertDialog.Cancel>
              <AlertDialog.Action
                onClick={performExit}
                className="focus-visible:ring-primary/60 min-h-11 rounded-[var(--radius-theme)] bg-red-600 px-4 py-2 text-base font-semibold text-white hover:bg-red-700 focus-visible:ring-2 focus-visible:outline-none"
              >
                {t("manager:exit.confirm", { defaultValue: "Beenden" })}
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </GameWrapper>
  )
}

export const Route = createFileRoute("/party/manager/$gameId")({
  component: ManagerGamePage,
  onLeave: ({ params: { gameId } }) => {
    socketClient.emit(EVENTS.MANAGER.LEAVE, { gameId })
  },
})
