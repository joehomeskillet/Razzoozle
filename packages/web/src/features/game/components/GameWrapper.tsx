import { EVENTS } from "@razzia/common/constants"
import type { Status } from "@razzia/common/types/game/status"
import background from "@razzia/web/assets/background.png"
import Button from "@razzia/web/components/Button"
import Loader from "@razzia/web/components/Loader"
import DisplayControl from "@razzia/web/features/manager/components/DisplayControl"
import LowLatencyHealth from "@razzia/web/features/game/components/LowLatencyHealth"
import { useThemeStore } from "@razzia/web/features/theme/store"
import { preloadFirstCorrectSound } from "@razzia/web/features/game/utils/firstCorrectSound"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { useQuestionStore } from "@razzia/web/features/game/stores/question"
import { buildJoinUrl } from "@razzia/web/features/game/utils/joinUrl"
import { MANAGER_SKIP_BTN } from "@razzia/web/features/game/utils/constants"
import clsx from "clsx"
import { Maximize } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { type PropsWithChildren, useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

type Props = PropsWithChildren & {
  statusName: Status | undefined
  onNext?: () => void
  onBack?: () => void
  manager?: boolean
}

const GameWrapper = ({
  children,
  statusName,
  onNext,
  onBack,
  manager,
}: Props) => {
  const { isConnected, socket } = useSocket()
  const { player } = usePlayerStore()
  const { gameId, inviteCode } = useManagerStore()
  const { questionStates, setQuestionStates } = useQuestionStore()
  const { theme } = useThemeStore()
  const { t } = useTranslation()
  const [isDisabled, setIsDisabled] = useState(false)
  const [autoOn, setAutoOn] = useState(false)

  const toggleAuto = () => {
    const nextAuto = !autoOn
    setAutoOn(nextAuto)
    socket.emit(EVENTS.MANAGER.SET_AUTO, {
      gameId: gameId ?? undefined,
      auto: nextAuto,
    })
  }

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.()
    } else {
      void document.documentElement.requestFullscreen?.()
    }
  }
  const next = statusName ? MANAGER_SKIP_BTN[statusName] : null
  const bgSrc =
    (manager ? theme.backgrounds.managerGame : theme.backgrounds.playerGame) ??
    background

  useEvent(EVENTS.GAME.UPDATE_QUESTION, ({ current, total }) => {
    setQuestionStates({
      current,
      total,
    })
  })

  useEvent(EVENTS.GAME.ERROR_MESSAGE, (message) => {
    toast.error(t(message))
    setIsDisabled(false)
  })

  useEffect(() => {
    setIsDisabled(false)
  }, [statusName])

  // Preload the "champions" sting at game start so it plays instantly.
  useEffect(() => {
    preloadFirstCorrectSound()
  }, [])

  const handleNext = () => {
    setIsDisabled(true)
    onNext?.()
  }

  return (
    <section className="relative flex min-h-dvh">
      <div className="fixed top-0 left-0 h-full w-full">
        <img
          className="pointer-events-none h-full w-full object-cover select-none"
          src={bgSrc}
          alt="background"
        />
        <div
          className="pointer-events-none absolute inset-0 bg-black"
          style={{ opacity: "var(--bg-scrim)" }}
        />
      </div>

      {/* Host-screen rejoin badge: a player who dropped scans this QR (or types
          the PIN shown on the slide) to come straight back to the game — their
          identity (points/place) is recovered via the durable clientId cookie. */}
      {manager && inviteCode && (
        <div className="fixed bottom-3 left-3 z-20 flex items-center gap-2 rounded-lg bg-black/60 p-2 text-white">
          <div className="rounded bg-white p-1">
            <QRCodeSVG value={buildJoinUrl(inviteCode)} size={56} />
          </div>
          <div className="leading-tight">
            <div className="text-[10px] font-semibold uppercase opacity-70">
              {t("game:rejoin")}
            </div>
            <div className="font-mono text-xl font-bold tracking-widest">
              {inviteCode}
            </div>
          </div>
        </div>
      )}

      <div className="z-10 flex w-full flex-1 flex-col justify-between">
        {!isConnected && !statusName ? (
          <div className="flex h-full w-full flex-1 flex-col items-center justify-center">
            <Loader className="h-30" />
            <h1 className="text-4xl font-bold text-white">
              {t("common:connecting")}
            </h1>
          </div>
        ) : (
          <>
            {/* Persistent reconnecting banner: a mid-game socket drop (when a
                statusName is already set, so the full-screen connecting loader
                above no longer fires) would otherwise be invisible. Show it
                whenever the socket is down so players/host know the game is
                paused, and block answer interaction until it recovers. */}
            {!isConnected && (
              <div
                role="status"
                aria-live="polite"
                className="fixed top-0 right-0 left-0 z-50 flex items-center justify-center gap-3 bg-black/80 px-4 py-2 text-center text-sm font-bold text-white"
              >
                <Loader className="h-5" />
                {t("common:reconnecting")}
              </div>
            )}

            <div className="flex w-full items-center justify-between gap-2 p-4">
              <div className="flex flex-1 justify-start">
                {questionStates && (
                  <div className="flex items-center rounded-md bg-white p-2 px-4 text-lg font-bold text-black">
                    {`${questionStates.current} / ${questionStates.total}`}
                  </div>
                )}
              </div>

              {manager && (
                <div className="flex flex-1 justify-center">
                  <button
                    type="button"
                    onClick={toggleAuto}
                    className="flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-bold text-black hover:bg-gray-200"
                    title="Auto-Modus: läuft automatisch weiter"
                  >
                    <span
                      className={clsx(
                        "relative h-5 w-9 rounded-full transition-colors",
                        autoOn ? "bg-primary" : "bg-gray-300",
                      )}
                    >
                      <span
                        className={clsx(
                          "absolute top-0.5 size-4 rounded-full bg-white transition-[left]",
                          autoOn ? "left-[18px]" : "left-0.5",
                        )}
                      />
                    </span>
                    Auto-Modus {autoOn ? "an" : "aus"}
                  </button>
                </div>
              )}

              <div className="flex flex-1 justify-end gap-2">
                {/* Low-latency health widget. Self-hides unless the server emits
                    a health snapshot (i.e. low-latency mode is on), so it is
                    inert in normal mode. */}
                {manager && <LowLatencyHealth />}
                {manager && <DisplayControl />}
                {manager && (
                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    title="Vollbild"
                    className="flex items-center rounded-md bg-white px-3 text-black hover:bg-gray-200"
                  >
                    <Maximize className="size-5" />
                  </button>
                )}
                {manager && next && (
                  <Button
                    className={clsx("bg-white px-4 text-black hover:bg-gray-200", {
                      "pointer-events-none": isDisabled,
                    })}
                    onClick={handleNext}
                  >
                    {t(next)}
                  </Button>
                )}

                {manager && onBack && (
                  <Button
                    onClick={onBack}
                    className="bg-white px-4 text-black hover:bg-gray-200"
                  >
                    {t("common:exit")}
                  </Button>
                )}
              </div>
            </div>

            <div
              aria-disabled={!isConnected}
              className={clsx(
                "flex flex-1 flex-col",
                !isConnected &&
                  "pointer-events-none opacity-60 select-none",
              )}
            >
              {children}
            </div>

            {!manager && (
              <div className="z-50 flex items-center justify-between bg-white px-4 py-2 text-lg font-bold text-white">
                <p className="text-gray-800">{player?.username}</p>
                <div className="rounded-lg bg-gray-800 px-3 py-1 text-lg tabular-nums">
                  {player?.points}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}

export default GameWrapper
