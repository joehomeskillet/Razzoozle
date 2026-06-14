import * as AlertDialog from "@radix-ui/react-alert-dialog"
import { EVENTS } from "@razzia/common/constants"
import type { Status } from "@razzia/common/types/game/status"
import { STATUS } from "@razzia/common/types/game/status"
import background from "@razzia/web/assets/background.webp"
import Button from "@razzia/web/components/Button"
import Loader from "@razzia/web/components/Loader"
import DisplayControl from "@razzia/web/features/manager/components/DisplayControl"
import SimControl from "@razzia/web/features/manager/components/SimControl"
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
import { useOnClickOutside } from "@razzia/web/hooks/useOnClickOutside"
import clsx from "clsx"
import { LogOut, Maximize, Maximize2, Pause, Play, X } from "lucide-react"
import QRCode from "@razzia/web/components/QRCode"
import { type PropsWithChildren, useEffect, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

type Props = PropsWithChildren & {
  statusName: Status | undefined
  onNext?: () => void
  onBack?: () => void
  manager?: boolean
  controls?: boolean
}

const GameWrapper = ({
  children,
  statusName,
  onNext,
  onBack,
  manager,
  controls = true,
}: Props) => {
  const { isConnected, socket } = useSocket()
  const { player } = usePlayerStore()
  const { gameId, inviteCode } = useManagerStore()
  const { questionStates, setQuestionStates } = useQuestionStore()
  const { theme } = useThemeStore()
  const { t } = useTranslation()
  const [isDisabled, setIsDisabled] = useState(false)
  const [autoOn, setAutoOn] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const qrContentRef = useRef<HTMLDivElement>(null)

  useOnClickOutside({ ref: qrContentRef, handler: () => setQrOpen(false) })

  // Pause is only meaningful between questions; the server rejects it mid-round
  // (and emits an ERROR_MESSAGE that the existing toast surfaces). The button
  // flips to Resume while the game is held in STATUS.PAUSED.
  const isPaused = statusName === STATUS.PAUSED
  const pauseGame = () => {
    socket.emit(EVENTS.MANAGER.PAUSE_GAME, { gameId: gameId ?? undefined })
  }
  const resumeGame = () => {
    socket.emit(EVENTS.MANAGER.RESUME_GAME, { gameId: gameId ?? undefined })
  }

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

  // In-game reconnect feedback: when a dropped player rejoins mid-quiz the
  // server pushes PLAYER_RECONNECTED so the host sees it on the live game
  // screen (not just in the lobby roster).
  useEvent(EVENTS.MANAGER.PLAYER_RECONNECTED, ({ username }) => {
    toast.success(t("game:playerReconnected", { name: username }))
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
          identity (points/place) is recovered via the durable clientId cookie.
          The whole badge is now a trigger: clicking it enlarges the QR (reusing
          the Room.tsx AlertDialog pattern) and exposes the host's Pause/Resume
          controls + a reconnect hint. */}
      {manager && inviteCode && (
        <AlertDialog.Root open={qrOpen} onOpenChange={setQrOpen}>
          <AlertDialog.Trigger asChild>
            <button
              type="button"
              className="group fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 z-20 flex cursor-pointer items-center gap-2 rounded-lg bg-black/60 p-2 text-left text-white"
              aria-label={t("game:rejoin")}
            >
              <div className="rounded bg-white p-1">
                <QRCode value={buildJoinUrl(inviteCode)} size={56} />
              </div>
              <div className="leading-tight">
                <div className="text-[10px] font-semibold uppercase opacity-70">
                  {t("game:rejoin")}
                </div>
                <div className="font-mono text-xl font-bold tracking-widest">
                  {inviteCode}
                </div>
              </div>
              <div className="ml-1 opacity-0 transition-opacity group-hover:opacity-100">
                <Maximize2 className="size-4" aria-hidden />
              </div>
            </button>
          </AlertDialog.Trigger>

          <AlertDialog.Portal>
            <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
            <AlertDialog.Content
              ref={qrContentRef}
              className="fixed top-1/2 left-1/2 z-50 flex w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-5 rounded-2xl bg-white p-6 text-black"
            >
              <AlertDialog.Title className="text-2xl font-bold">
                {t("game:rejoin")}
              </AlertDialog.Title>
              <button
                type="button"
                onClick={() => setQrOpen(false)}
                className="absolute -top-3 -right-3 rounded-full bg-white p-1.5 shadow-md hover:bg-gray-100"
                aria-label={t("common:cancel")}
              >
                <X className="size-6 text-gray-700" />
              </button>
              <QRCode
                className="size-56 md:size-64"
                size={300}
                value={buildJoinUrl(inviteCode)}
              />
              <div className="font-mono text-3xl font-bold tracking-widest">
                {inviteCode}
              </div>
              <p className="text-center text-sm text-gray-600">
                {t("game:pause.resumeHint")}
              </p>
              <div className="flex w-full justify-center gap-3">
                {isPaused ? (
                  <Button
                    variant="primary"
                    size="sm"
                    className="min-h-11 px-5"
                    onClick={resumeGame}
                  >
                    <Play className="size-5" aria-hidden />
                    {t("game:pause.resumeGame")}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="min-h-11 px-5"
                    onClick={pauseGame}
                  >
                    <Pause className="size-5" aria-hidden />
                    {t("game:pause.pauseGame")}
                  </Button>
                )}
              </div>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog.Root>
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

            {/* Host control bar. On a narrow phone the right cluster holds up to
                six >=44px controls, so the row must reflow rather than squeeze:
                the bar wraps, the counter and Auto toggle keep their intrinsic
                width (no rigid flex-1), and the right cluster grows to fill the
                line and wraps its own buttons when it runs out of room. */}
            <div className="flex w-full flex-wrap items-center justify-between gap-2 p-4">
              <div className="flex shrink-0 justify-start">
                {questionStates && (
                  <div className="flex min-h-11 items-center rounded-lg bg-white px-4 text-lg font-bold text-black">
                    {`${questionStates.current} / ${questionStates.total}`}
                  </div>
                )}
              </div>

              {manager && controls && (
                <div className="flex shrink-0 justify-center">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={toggleAuto}
                    aria-pressed={autoOn}
                    // ON = a quieter "active" treatment (NavItem-style: tinted
                    // --accent-tint wash + accent text) rather than a solid fill,
                    // so it reads as an enabled mode without competing with the
                    // single solid-accent primary Next/Start CTA.
                    className={clsx("min-h-11", {
                      "border-[var(--accent-tint)] bg-[var(--accent-tint)] text-[var(--accent-contrast)] hover:bg-[var(--accent-tint)]":
                        autoOn,
                    })}
                    title={t("game:controls.autoTitle")}
                  >
                    <span
                      className={clsx(
                        "relative h-5 w-9 rounded-full transition-colors",
                        autoOn ? "bg-[var(--accent-contrast)]" : "bg-gray-300",
                      )}
                    >
                      <span
                        className={clsx(
                          "absolute top-0.5 size-4 rounded-full bg-white transition-[left]",
                          autoOn ? "left-[18px]" : "left-0.5",
                        )}
                      />
                    </span>
                    {/* Label collapses to the toggle pill alone under `sm` to
                        keep the bar from overflowing on a host phone; the full
                        label returns at `sm+`. aria-pressed + title carry the
                        state for assistive tech when the text is hidden. */}
                    <span className="hidden sm:inline">
                      {t("game:controls.autoMode")}{" "}
                      {autoOn
                        ? t("game:controls.autoOn")
                        : t("game:controls.autoOff")}
                    </span>
                  </Button>
                </div>
              )}

              <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
                {/* Low-latency health widget. Self-hides unless the server emits
                    a health snapshot (i.e. low-latency mode is on), so it is
                    inert in normal mode. */}
                {manager && controls && <LowLatencyHealth />}
                {manager && controls && <DisplayControl />}
                {manager && controls && import.meta.env.DEV && <SimControl />}
                {/* Fullscreen is a kiosk affordance, not a manager control:
                    show it whenever the manager chrome renders (incl. the passive
                    /display + /satellite beamer, where auto-requestFullscreen is
                    blocked without a user gesture, so the button is the only way). */}
                {manager && (
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={toggleFullscreen}
                    title={t("game:controls.fullscreen")}
                    aria-label={t("game:controls.fullscreen")}
                  >
                    <Maximize className="size-5" aria-hidden />
                  </Button>
                )}
                {manager && next && (
                  <Button
                    variant="primary"
                    size="sm"
                    className={clsx("min-h-11 px-5", {
                      "pointer-events-none": isDisabled,
                    })}
                    onClick={handleNext}
                  >
                    {t(next)}
                  </Button>
                )}

                {manager && onBack && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="min-h-11"
                    onClick={onBack}
                  >
                    <LogOut className="size-5" aria-hidden />
                    <span className="hidden sm:inline">{t("common:exit")}</span>
                  </Button>
                )}
              </div>
            </div>

            <div
              aria-disabled={!isConnected}
              className={clsx(
                "flex min-h-0 flex-1 flex-col overflow-y-auto pb-24 lg:pb-0",
                !isConnected && "pointer-events-none opacity-60 select-none",
              )}
            >
              {children}
            </div>

            {!manager && (
              <div className="z-50 flex items-center justify-between bg-white px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-lg font-bold text-white">
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