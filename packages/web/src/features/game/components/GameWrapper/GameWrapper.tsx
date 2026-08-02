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
import GameControlPanel from "./GameControlPanel"
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
import { GameAudienceContext, audienceFromWrapperProps } from "../../audience"
import clsx from "clsx"
import { AnimatePresence, motion } from "motion/react"
import {
  useReveal,
  DURATION,
  EASE,
} from "@razzoozle/web/features/game/animation/presets"
import { LogOut, Maximize } from "lucide-react"
import {
  type PropsWithChildren,
  type ReactNode,
  useEffect,
  useState,
  useRef,
} from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

type PresenterLayout = "normal" | "experience-immersive"

type Props = PropsWithChildren & {
  statusName: Status | undefined
  // WP-958F-W: when set, pins the animated content subtree key so experience
  // scenes (Flower/Pixi) survive Question → Result → next Question. When omitted,
  // falls back to statusName (classic remount / re-animation behavior).
  contentTransitionKey?: string
  /**
   * Optional player chrome rendered in the topbar region, outside the
   * scrollable and animated game-content subtree.
   */
  playerTopbarReplacement?: ReactNode
  /**
   * WP-946-C3: hide the player top chrome (question progress + AV toggles)
   * on Flower Battle gameplay. The compact FlowerBattlePlayerStatus HUD
   * replaces it; classic/join/waiting keep the default top bar.
   */
  hidePlayerTopbar?: boolean
  onNext?: () => void
  onBack?: () => void
  manager?: boolean
  controls?: boolean
  /**
   * Satellite/display kiosk: suppress manager chrome and pad so the experience
   * canvas owns the full content box (no interactive toolbar).
   */
  managerKioskFullBleed?: boolean
  /**
   * Presenter layout variant driven by live experience state (not CSS/URL).
   * `experience-immersive` keeps manager controls as floating overlays over a
   * full-bleed game surface; `normal` keeps the classic cream + toolbar flow.
   */
  presenterLayout?: PresenterLayout
  /**
   * FB-HUD4: keep the flow toolbar visible AND let the content area fill the
   * remaining viewport (no padding, no overflow). Used by flower-battle
   * presenter where the classic cream chips should sit on top of a
   * full-bleed canvas. Independent of `presenterLayout` so flow chrome +
   * full-bleed canvas can coexist without flipping into immersive mode.
   */
  fullBleedCanvas?: boolean
}

const GameWrapper = ({
  children,
  statusName,
  contentTransitionKey,
  playerTopbarReplacement,
  hidePlayerTopbar = false,
  onNext,
  onBack,
  manager,
  controls = true,
  managerKioskFullBleed = false,
  presenterLayout = "normal",
  fullBleedCanvas = false,
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

  const audience = audienceFromWrapperProps(manager, controls)
  const isManagerKioskFullBleed = manager && managerKioskFullBleed
  const isExperienceImmersive =
    manager && presenterLayout === "experience-immersive"
  // Full-bleed content shell: satellite kiosk OR immersive experience on the
  // phone manager — both need the game to own the entire content box.
  // FB-HUD4: `fullBleedCanvas` adds a third path that keeps the flow toolbar
  // visible AND lets the content area fill the remaining viewport.
  const isContentFullBleed =
    isManagerKioskFullBleed || isExperienceImmersive || fullBleedCanvas
  // Flow toolbar (classic cream presenter). Immersive + full-bleed kiosk both
  // skip the flow toolbar so the canvas owns the viewport; fullBleedCanvas
  // alone keeps the flow chrome visible on top of the canvas.
  const showFlowToolbar = manager && !isManagerKioskFullBleed && !isExperienceImmersive
  const showOverlayToolbar = isExperienceImmersive && controls

  return (
    <GameAudienceContext.Provider value={audience}>
      <section
        className={clsx(
          // WP-958E: w-full — /party/manager wraps this section in a row-flex
          // `flex h-dvh w-full` box, so as a flex item its main-axis size
          // shrink-fits to content without an explicit width, shifting
          // SHOW_START and the Flower Battle presenter HUD off the route
          // center. On the player route the section is the block-level root
          // (auto width already fills), so w-full is a no-op safeguard there.
          "relative flex w-full",
          // WP-958D: presenter/display surfaces (manager) pin the route-level
          // height chain to a definite, non-scrolling 100dvh box — the same
          // contract `.display-kiosk` establishes for the /display routes.
          // min-h-dvh only set a *minimum*, leaving the box height indefinite,
          // so every h-full/flex-1 descendant down to ExperienceViewport
          // collapsed to content height and ExperienceStage's aspect-video
          // fallback derived height from width (1080px at 1920w), pushing the
          // toolbar + HUD ~304px past the viewport fold on /party/manager.
          // With a definite root the whole chain resolves and the scene fills
          // exactly the space the presenter chrome leaves behind. The player
          // client keeps the legacy min-h-dvh growth (long grids scroll).
          manager ? "h-dvh overflow-hidden" : "min-h-dvh",
        )}
        style={
          {
            "--game-fg": "#0E1120",
            // FB-HUD5: toolbar height CSS var consumed by the content area's
            // `padding-top` when `fullBleedCanvas` floats the toolbar out of
            // the flex flow. Keeps the canvas flush under the buttons without
            // depending on JS measurement.
            ...(fullBleedCanvas ? { "--toolbar-h": "4rem" } : null),
            // Experience safe-area contract (React HUD ↔ Pixi content).
            ...(isExperienceImmersive
              ? {
                  "--experience-safe-top": "4.75rem",
                  "--experience-safe-bottom": "7.5rem",
                  "--experience-safe-left": "0.75rem",
                  "--experience-safe-right": "0.75rem",
                }
              : null),
          } as React.CSSProperties
        }
        data-audience={audience}
        data-presenter-layout={
          isExperienceImmersive ? "experience-immersive" : "normal"
        }
      >
        {/* WP-F: the body radial-gradient is the app-wide cream field. On the
            manager presenter toolbar it bleeds through the gaps between
            buttons as a cream/grey wash (visible in classic mode AND on the
            lobby screen). The toolbar now owns its own opaque surface
            (`bg-surface`) so the cream is never visible in the toolbar band,
            and the legacy `.cream-field` underlay is removed here for
            consistency with the immersive / full-bleed branches that already
            skip it. The class itself stays defined for the display kiosk and
            submission pages that still render it intentionally. */}

        <div
          className={clsx(
            "z-10 flex w-full flex-1 flex-col",
            isContentFullBleed ? "min-h-0" : "justify-between",
          )}
        >
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

              {/* Player topbar region stays outside the scrollable, animated
                  content shell. Flower Battle supplies its compact HUD here;
                  classic/join/waiting retain the default player chrome. */}
              {!manager &&
                (playerTopbarReplacement !== undefined ? (
                  <div
                    data-testid="player-topbar-replacement"
                    className="w-full shrink-0 px-4 pt-[max(0.5rem,env(safe-area-inset-top))]"
                  >
                    {playerTopbarReplacement}
                  </div>
                ) : !hidePlayerTopbar ? (
                  <div
                    data-testid="game-topbar"
                    className="border-line bg-surface flex w-full items-center justify-between gap-2 border-b px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]"
                  >
                    <div className="flex shrink-0 justify-start">
                      {questionStates && (
                        <div className="flex items-center gap-1 text-sm font-semibold text-[color:var(--game-fg)]">
                          <span>{t("game:questionPrefix")}</span>
                          <span>{`${questionStates.current} / ${questionStates.total}`}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <AvToggles />
                    </div>
                  </div>
                ) : null)}

              {/* Presenter-Toolbar (flow): classic cream presenter only */}
              {showFlowToolbar && controls && (
                <div
                  data-testid="presenter-toolbar"
                  data-toolbar-variant="flow"
                  className={clsx(
                    "flex w-full flex-wrap items-center justify-between gap-2",
                    // FB-HUD4: fullBleedCanvas keeps the toolbar flush against
                    // the canvas (no cream margin between them). The chips
                    // still carry their own p-1 inside.
                    fullBleedCanvas ? "p-2" : "p-4",
                    // WP-F: classic mode owns an opaque `bg-surface` so the
                    // body cream never bleeds through the gaps between
                    // buttons. fullBleedCanvas keeps the toolbar transparent
                    // so the canvas shows through; the cream chip wrappers
                    // (hud-chip-cream) and the cream Progress chip
                    // (bg-surface-cream) are dropped in both modes — the
                    // cream visual identity belongs to the lobby content
                    // (Room / Wait), not the toolbar.
                    fullBleedCanvas ? null : "bg-surface",
                    // FB-HUD5: float the toolbar out of the flex flow so the
                    // content area takes the full section height and the
                    // canvas paints full-bleed behind the buttons. The
                    // matching `pt-[var(--toolbar-h)]` on the content area
                    // below keeps the scene clear of the buttons.
                    fullBleedCanvas && "absolute inset-x-0 top-0 z-20",
                  )}
                >
                  {/* GROUP A: Progress + Auto-Mode */}
                  <div
                    className={clsx(
                      "flex shrink-0 items-center gap-2 p-0",
                    )}
                  >
                    {questionStates && (
                      <div className="flex min-h-11 items-center rounded-lg bg-surface px-4 text-lg font-bold text-ink">
                        {`${questionStates.current} / ${questionStates.total}`}
                      </div>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={toggleAuto}
                      aria-pressed={autoOn}
                      className={clsx("min-h-11", {
                        "bg-accent-tint text-accent-contrast hover:bg-accent-tint border-[var(--accent-tint)]":
                          autoOn,
                      })}
                      title={t("game:controls.autoTitle")}
                    >
                      <span
                        className={clsx(
                          "relative h-5 w-9 rounded-full transition-colors",
                          autoOn
                            ? "bg-[var(--accent-contrast)]"
                            : "bg-[color:var(--color-field-ink)]/20",
                        )}
                      >
                        <span
                          className={clsx(
                            "absolute top-0.5 size-4 rounded-full bg-white transition-[left]",
                            autoOn ? "left-[18px]" : "left-0.5",
                          )}
                        />
                      </span>
                      <span className="hidden sm:inline">
                        {t("game:controls.autoMode")}{" "}
                        {autoOn
                          ? t("game:controls.autoOn")
                          : t("game:controls.autoOff")}
                      </span>
                    </Button>
                  </div>

                  {/* GROUP B: Media/Display Controls (Icon Buttons) */}
                  <div
                    className={clsx(
                      "flex flex-1 flex-wrap items-center justify-center gap-2 p-0",
                    )}
                  >
                    <AvToggles />
                    {statusName !== STATUS.FINISHED && lowLatencyEnabled && (
                      <LowLatencyHealth />
                    )}
                    {statusName !== STATUS.FINISHED && <DisplayControl />}
                    {statusName !== STATUS.FINISHED && <DisplayStatusCard />}
                    {statusName !== STATUS.FINISHED &&
                      statusName !== STATUS.SHOW_ROUND_RECAP && (
                        <GameControlPanel />
                      )}
                    {statusName !== STATUS.FINISHED && import.meta.env.DEV && (
                      <SimControl />
                    )}
                    {statusName !== STATUS.FINISHED &&
                      inviteCode &&
                      statusName !== STATUS.SHOW_ROOM && (
                        <RejoinQrDialog
                          inviteCode={inviteCode}
                          statusName={statusName}
                        />
                      )}
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={toggleFullscreen}
                      title={t("game:controls.fullscreen")}
                      aria-label={t("game:controls.fullscreen")}
                    >
                      <Maximize className="size-5" aria-hidden />
                    </Button>
                  </div>

                  {/* GROUP C: Phase Actions (Primary Next + Secondary Exit) */}
                  <div
                    className={clsx(
                      "flex shrink-0 items-center gap-2 p-0",
                    )}
                  >
                    {statusName !== STATUS.FINISHED &&
                      statusName !== STATUS.SHOW_ROUND_RECAP &&
                      next && (
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
                    {onBack && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="min-h-11"
                        onClick={onBack}
                      >
                        <LogOut className="size-5" aria-hidden />
                        <span className="hidden sm:inline">
                          {t("common:exit")}
                        </span>
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Display mode fallback (manager && !controls): classic flow only */}
              {showFlowToolbar && !controls && (
                <div
                  data-testid="presenter-toolbar"
                  data-toolbar-variant="flow"
                  className={clsx(
                    "flex w-full flex-wrap items-center justify-between gap-2 p-4",
                    // WP-F: same opaque surface as the controls branch so the
                    // body cream never bleeds through the gaps between
                    // buttons in the display fallback either.
                    fullBleedCanvas ? null : "bg-surface",
                    // FB-HUD5: mirror the controls branch so the display
                    // fallback also floats above the canvas when the route
                    // is in fullBleedCanvas mode.
                    fullBleedCanvas && "absolute inset-x-0 top-0 z-20",
                  )}
                >
                  <div className="flex shrink-0 justify-start p-0">
                    {questionStates && (
                      <div className="flex min-h-11 items-center rounded-lg bg-surface px-4 text-lg font-bold text-ink">
                        {`${questionStates.current} / ${questionStates.total}`}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
                    <AvToggles />
                    {inviteCode && statusName !== STATUS.SHOW_ROOM && (
                      <RejoinQrDialog
                        inviteCode={inviteCode}
                        statusName={statusName}
                      />
                    )}
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={toggleFullscreen}
                      title={t("game:controls.fullscreen")}
                      aria-label={t("game:controls.fullscreen")}
                    >
                      <Maximize className="size-5" aria-hidden />
                    </Button>
                    {statusName !== STATUS.FINISHED &&
                      statusName !== STATUS.SHOW_ROUND_RECAP &&
                      next && (
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
                    {onBack && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="min-h-11"
                        onClick={onBack}
                      >
                        <LogOut className="size-5" aria-hidden />
                        <span className="hidden sm:inline">
                          {t("common:exit")}
                        </span>
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Immersive experience: floating glass-chip toolbar over the game */}
              {showOverlayToolbar && (
                <div
                  data-testid="presenter-toolbar"
                  data-toolbar-variant="overlay"
                  className="pointer-events-none absolute inset-x-0 top-0 z-30 flex w-full flex-wrap items-start justify-between gap-2 p-2 sm:p-3"
                >
                  <div
                    className={clsx(
                      "pointer-events-auto flex shrink-0 items-center gap-2 p-0",
                    )}
                  >
{questionStates && (
                      <div
                        className={clsx(
                          "flex min-h-11 items-center rounded-lg px-4 text-lg font-bold text-ink",
                        )}
                      >
                        {`${questionStates.current} / ${questionStates.total}`}
                      </div>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={toggleAuto}
                      aria-pressed={autoOn}
                      className={clsx("min-h-11", {
                        "bg-accent-tint text-accent-contrast hover:bg-accent-tint border-[var(--accent-tint)]":
                          autoOn,
                      })}
                      title={t("game:controls.autoTitle")}
                    >
                      <span
                        className={clsx(
                          "relative h-5 w-9 rounded-full transition-colors",
                          autoOn
                            ? "bg-[var(--accent-contrast)]"
                            : "bg-[color:var(--color-field-ink)]/20",
                        )}
                      >
                        <span
                          className={clsx(
                            "absolute top-0.5 size-4 rounded-full bg-white transition-[left]",
                            autoOn ? "left-[18px]" : "left-0.5",
                          )}
                        />
                      </span>
                      <span className="hidden sm:inline">
                        {t("game:controls.autoMode")}{" "}
                        {autoOn
                          ? t("game:controls.autoOn")
                          : t("game:controls.autoOff")}
                      </span>
                    </Button>
                  </div>

                  <div
                    className={clsx(
                      "pointer-events-auto flex max-w-full flex-1 flex-wrap items-center justify-center gap-1.5 p-0 sm:gap-2",
                    )}
                  >
                    <AvToggles />
                    {statusName !== STATUS.FINISHED && lowLatencyEnabled && (
                      <LowLatencyHealth />
                    )}
                    {statusName !== STATUS.FINISHED && <DisplayControl />}
                    {statusName !== STATUS.FINISHED && <DisplayStatusCard />}
                    {statusName !== STATUS.FINISHED &&
                      statusName !== STATUS.SHOW_ROUND_RECAP && (
                        <GameControlPanel />
                      )}
                    {statusName !== STATUS.FINISHED && import.meta.env.DEV && (
                      <SimControl />
                    )}
                    {statusName !== STATUS.FINISHED &&
                      inviteCode &&
                      statusName !== STATUS.SHOW_ROOM && (
                        <RejoinQrDialog
                          inviteCode={inviteCode}
                          statusName={statusName}
                        />
                      )}
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={toggleFullscreen}
                      title={t("game:controls.fullscreen")}
                      aria-label={t("game:controls.fullscreen")}
                    >
                      <Maximize className="size-5" aria-hidden />
                    </Button>
                  </div>

                  <div
                    className={clsx(
                      "pointer-events-auto flex shrink-0 items-center gap-2 p-0",
                    )}
                  >
                    {statusName !== STATUS.FINISHED &&
                      statusName !== STATUS.SHOW_ROUND_RECAP &&
                      next && (
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
                    {onBack && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="min-h-11"
                        onClick={onBack}
                      >
                        <LogOut className="size-5" aria-hidden />
                        <span className="hidden sm:inline">
                          {t("common:exit")}
                        </span>
                      </Button>
                    )}
                  </div>
                </div>
              )}

              <div
                aria-disabled={!isConnected}
                className={clsx(
                  "flex min-h-0 flex-1 flex-col",
                  isContentFullBleed
                    ? "relative w-full overflow-hidden"
                    : "justify-center overflow-y-auto px-4 pt-2 pb-4",
                  // FB-HUD5: the toolbar is `absolute inset-x-0 top-0` so the
                  // content area gets the full section height — push it down
                  // by `--toolbar-h` so the scene never sits behind the
                  // buttons. Cream-chip-wrapper bg stays off in this branch
                  // (see Group A/B/C below), so the canvas reads through.
                  fullBleedCanvas && "pt-[var(--toolbar-h)]",
                  // The rejoin QR now lives inline in the top host-icon row (no
                  // longer a fixed bottom-left badge), so the old manager-only
                  // pb-24 pad that cleared it is gone — manager and player share
                  // the same small bottom pad.
                  !isConnected && "pointer-events-none opacity-60 select-none",
                )}
              >
                {/* State-transition choreography: each game screen cross-fades as
                    the status changes, giving one continuous flow across the whole
                    game loop. Default key is statusName so classic per-phase
                    remount/re-animation stays inside Question.tsx. Presenter
                    routes with a live non-classic experience pass
                    contentTransitionKey so the React/Pixi scene is not torn down
                    on Question → Result → next Question (WP-958F-W plant jump).
                    Reduced motion -> instant opacity. */}
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={contentTransitionKey ?? statusName ?? "none"}
                    data-content-transition-key={
                      contentTransitionKey ?? statusName ?? "none"
                    }
                    className={clsx(
                      "flex min-h-0 w-full flex-1 flex-col",
                      isContentFullBleed ? "h-full" : "justify-center",
                    )}
                    initial={reveal.reduced ? false : { opacity: 0, y: 8 }}
                    animate={
                      reveal.reduced ? { opacity: 1 } : { opacity: 1, y: 0 }
                    }
                    // Exit is a fast pure-opacity fade (no upward jump) so the
                    // mode="wait" swap stays tight — no long blank gap on the
                    // frequent Question -> Result -> Leaderboard loop.
                    exit={
                      reveal.reduced
                        ? { opacity: 0 }
                        : {
                            opacity: 0,
                            transition: { duration: DURATION.fast },
                          }
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
                <div
                  data-testid="player-footer"
                  className="sticky bottom-0 z-50 flex items-center justify-between bg-[var(--footer-bg)] px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-lg font-bold text-[var(--footer-text)]"
                >
                  <p className="text-[var(--footer-text)]">
                    {player?.username}
                  </p>
                  <div className="rounded-lg border border-[var(--border-hairline)] bg-white px-3 py-1 text-lg text-[color:var(--game-fg)] tabular-nums">
                    {player?.points}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </GameAudienceContext.Provider>
  )
}

export default GameWrapper
