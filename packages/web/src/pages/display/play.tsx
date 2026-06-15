import {
  DISPLAY_HEARTBEAT_INTERVAL_MS,
  EVENTS,
} from "@razzoozle/common/constants"
import Loader from "@razzoozle/web/components/Loader"
import GameWrapper from "@razzoozle/web/features/game/components/GameWrapper"
import {
  socketClient,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { useManagerGameSession } from "@razzoozle/web/features/game/hooks/useManagerGameSession"
import { useThemeStore } from "@razzoozle/web/features/theme/store"
import { createFileRoute, useSearch } from "@tanstack/react-router"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { z } from "zod"

// Fullscreen display "play" view.
//
// This mirrors the manager presentation (`/party/manager/$gameId` and the
// `/satellite/$gameId` kiosk) but is a PURE display: no skip/back/auto buttons,
// no player score bar, no navigation. We reuse GameWrapper with `manager` so the
// presentation chrome (background, question counter, rejoin QR) matches the host
// screen, but pass `controls={false}` to explicitly suppress every manager
// interactive control (auto-advance toggle, low-latency health, display pairing
// panel, fullscreen button) — the skip/back buttons are also absent since we
// pass NO onNext/onBack handlers.
//
// The display is reached after pairing on `/display`; the gameId arrives as a
// search param. We reconnect to that game over the (already display-authed)
// socket and render whatever EVENTS.GAME.STATUS the server pushes, in realtime.

const searchSchema = z.object({
  gameId: z.coerce.string().optional(),
})

const DisplayPlayPage = () => {
  const { gameId: gameIdParam } = useSearch({ from: "/display/play" })
  const { t } = useTranslation()
  const { socket } = useSocket()
  const appTitle = useThemeStore((s) => s.theme.appTitle)

  // Best-effort fullscreen for the beamer (kiosk Chromium already covers this).
  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {
      /* Ignore: fullscreen needs a gesture outside kiosk mode */
    })
  }, [])

  // WP-15 — once paired, the display heartbeats so the manager's live status
  // card shows it as online + the relative "last seen". The server records the
  // display at PAIR_SUCCESS and bumps lastPingAt on each ping; missing the
  // window flips the card to offline and the 60s sweep prunes a dead kiosk.
  // Cleared on unmount (e.g. navigating away) so no orphaned interval.
  useEffect(() => {
    if (!gameIdParam) {
      return
    }

    const name =
      appTitle?.trim() ||
      t("display:defaultName", { defaultValue: "Beamer" })

    const id = setInterval(() => {
      socket.emit(EVENTS.DISPLAY.PING, { gameId: gameIdParam, name })
    }, DISPLAY_HEARTBEAT_INTERVAL_MS)

    return () => {
      clearInterval(id)
    }
  }, [socket, gameIdParam, appTitle, t])

  // Join the paired game. We reconnect as a manager-equivalent display; the
  // socket was already authenticated during the display pairing handshake.
  // `reconnectIfConnected` also fires the reconnect immediately when we land
  // here already connected (in-app navigation from /display).
  const { status, CurrentComponent } = useManagerGameSession(gameIdParam, {
    reconnectIfConnected: true,
  })

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

  // GameWrapper with `manager` chrome but `controls={false}` → a clean,
  // distraction-free presentation sized for a beamer/TV.
  return (
    <div className="display-stage h-full w-full">
      <GameWrapper statusName={status.name} manager controls={false}>
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
