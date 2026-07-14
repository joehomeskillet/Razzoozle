import { EVENTS } from "@razzoozle/common/constants"
import type { Status } from "@razzoozle/common/types/game/status"
import { STATUS } from "@razzoozle/common/types/game/status"
import Button from "@razzoozle/web/components/Button"
import Loader from "@razzoozle/web/components/Loader"
import DisplayControl from "@razzoozle/web/features/manager/components/DisplayControl"
import DisplayStatusCard from "@razzoozle/web/features/manager/components/DisplayStatusCard"
import SimControl from "@razzoozle/web/features/manager/components/SimControl"
import AvToggles from "./AvToggles"
import RejoinQrDialog from "./RejoinQrDialog"
import LowLatencyHealth from "@razzoozle/web/features/game/components/LowLatencyHealth"
import { getLowLatencyPref } from "@razzoozle/web/features/game/utils/lowLatencyPref"
import { preloadFirstCorrectSound } from "@razzoozle/web/features/game/utils/firstCorrectSound"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { usePlayerStore } from "@razzoozle/web/features/game/stores/player"
import { useManagerStore } from "@razzoozle/web/features/game/stores/manager"
import { useQuestionStore } from "@razzoozle/web/features/game/stores/question"
import { MANAGER_SKIP_BTN } from "@razzoozle/web/features/game/utils/constants"
import clsx from "clsx"
import { AnimatePresence, motion } from "motion/react"
import {
  useReveal,
  DURATION,
  EASE,
} from "@razzoozle/web/features/game/animation/presets"
import { LogOut, Maximize } from "lucide-react"
import { type PropsWithChildren, useEffect, useState, useRef } from "react"
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
  // Host opt-in for the LowLatencyHealth diagnostic widget. Mirrors the
  // manager's persisted low-latency toggle (server config) via localStorage,
  // since GameWrapper renders outside the manager ConfigProvider. Default off.
  const [lowLatencyEnabled] = useState(getLowLatencyPref)
  const { t } = useTranslation()
  const reveal = useReveal()
  const [isDisabled, setIsDisabled] = useState(false)
  const [autoOn, setAutoOn] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    // Clear any pending timeout when status changes (action succeeded)
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setIsDisabled(false)
  }, [statusName])

  // Preload the "champions" sting at game start so it plays instantly.
  useEffect(() => {
    preloadFirstCorrectSound()
  }, [])

  const handleNext = () => {
    setIsDisabled(true)
    // Arm a timeout: if no new status arrives within ~5s, re-enable the button
    // so the host can retry instead of being permanently stuck. Clear the
    // timeout if statusName changes (status effect above handles it).
    timeoutRef.current = setTimeout(() => {
      setIsDisabled(false)
      timeoutRef.current = null
    }, 5000)
    onNext?.()
  }

  return (
    <section
      className="relative flex min-h-dvh"
      style={{ "--game-fg": "#0E1120" } as React.CSSProperties}
    >
      <div className="cream-field pointer-events-none fixed inset-0" />

      <div className="z-10 flex w-full flex-1 flex-col justify-between">
        {!isConnected && !statusName ? (
          <div className="flex h-full w-full flex-1 flex-col items-center justify-center">
            <Loader className="h-30" />
            <h1 className="text-4xl font-bold text-[color:var(--game-fg)]">
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
                className="fixed top-0 right-0 left-0 z-50 flex items-center justify-center gap-3 bg-[color:var(--color-field-ink)] px-4 py-2 text-center text-sm font-bold text-white"
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
                        autoOn ? "bg-[var(--accent-contrast)]" : "bg-[color:var(--color-field-ink)]/20",
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
                <AvToggles />
                {/* Low-latency health widget. Opt-in: only mounts when the
                    manager activated Low-Latency-Modus (lowLatencyEnabled pref).
                    Even then it self-hides until the server emits a health
                    snapshot, so it stays inert in normal mode. */}
                {manager && controls && lowLatencyEnabled && (
                  <LowLatencyHealth />
                )}
                {manager && controls && <DisplayControl />}
                {manager && controls && <DisplayStatusCard />}
                {manager && controls && import.meta.env.DEV && <SimControl />}
                {/* Rejoin QR control. Now lives inline with the other host
                    icons (no longer a lone fixed bottom-left badge): a flat
                    cream icon button matching the mute/haptics/fullscreen
                    siblings. Clicking it opens the AlertDialog popover with the
                    enlarged QR, the join PIN and the host Pause/Resume controls
                    — a dropped player scans it (or types the PIN) to recover
                    their identity via the durable clientId cookie. */}
                {manager &&
                  inviteCode &&
                  statusName !== STATUS.SHOW_ROOM && (
                    <RejoinQrDialog
                      inviteCode={inviteCode}
                      statusName={statusName}
                    />
                  )}
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
                    data-testid="next-btn"
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
                "flex min-h-0 flex-1 flex-col justify-center overflow-y-auto px-4 pt-2 pb-4",
                // The rejoin QR now lives inline in the top host-icon row (no
                // longer a fixed bottom-left badge), so the old manager-only
                // pb-24 pad that cleared it is gone — manager and player share
                // the same small bottom pad.
                !isConnected && "pointer-events-none opacity-60 select-none",
              )}
            >
              {/* State-transition choreography: each game screen cross-fades as
                  the status changes, giving one continuous flow across the whole
                  game loop. Keyed by statusName so per-question re-animation
                  stays inside Question.tsx. Reduced motion -> instant opacity. */}
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={statusName ?? "none"}
                  className="flex min-h-0 w-full flex-1 flex-col justify-center"
                  initial={reveal.reduced ? false : { opacity: 0, y: 8 }}
                  animate={reveal.reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
                  // Exit is a fast pure-opacity fade (no upward jump) so the
                  // mode="wait" swap stays tight — no long blank gap on the
                  // frequent Question -> Result -> Leaderboard loop.
                  exit={
                    reveal.reduced
                      ? { opacity: 0 }
                      : { opacity: 0, transition: { duration: DURATION.fast } }
                  }
                  transition={
                    reveal.reduced
                      ? { duration: DURATION.instant }
                      : { duration: DURATION.base, ease: EASE.out }
                  }
                >
                  {children}
                </motion.div>
              </AnimatePresence>
            </div>

            {!manager && (
              <div className="z-50 flex items-center justify-between bg-[var(--footer-bg)] px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-lg font-bold text-[var(--footer-text)]">
                <p className="text-[var(--footer-text)]">{player?.username}</p>
                <div className="rounded-lg bg-white border border-[var(--border-hairline)] px-3 py-1 text-lg tabular-nums text-[var(--game-fg)]">
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
