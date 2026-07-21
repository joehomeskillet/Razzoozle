import { EVENTS } from "@razzoozle/common/constants"
import type { GameSummary } from "@razzoozle/common/types/game"
import type { MetricsHealthSnapshot } from "@razzoozle/common/types/game/socket"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzoozle/web/features/game/stores/manager"
import { useConfig } from "@razzoozle/web/features/manager/contexts/config-context"
import { useEffect, useState } from "react"

export interface DisplayRow {
  socketId: string
  name: string
  lastPingAt: number // epoch seconds (dayjs().unix())
}

export const useDevTelemetry = () => {
  const { socket, isConnected } = useSocket()
  const config = useConfig()
  // The manager's own current game — the same source LowLatencyHealth scopes to.
  // null whenever no game is live, which lets us tear down stale telemetry.
  const { gameId } = useManagerStore()

  // For components that open URLs in new tabs (window.open), keep the query param behavior
  // for now to avoid breaking the UI. Security hygiene: header would be better (not in browser
  // history), but window.open can't pass custom headers. In the future, we could switch to
  // a dialog that passes headers programmatically.
  const withToken = (url: string): string =>
    config.devApiKey
      ? `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(config.devApiKey)}`
      : url

  const [games, setGames] = useState<GameSummary[]>([])
  const [displays, setDisplays] = useState<DisplayRow[]>([])
  const [snapshot, setSnapshot] = useState<MetricsHealthSnapshot | null>(null)
  // apiInfo is always null: the /api/openapi.json endpoint was never implemented,
  // so the banner remains hidden. The route table is available at /api/v1/observability/schema.
  const apiInfo = null
  // A ticking "now" (epoch seconds) so each display's relative "last seen"
  // re-evaluates every second without a server round-trip.
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))

  // Request the live game list on mount / reconnect. The server pushes
  // GAMES_DATA back to this socket; re-running on reconnect self-heals a deploy.
  useEffect(() => {
    if (isConnected) {
      socket.emit(EVENTS.MANAGER.LIST_GAMES)
    }
  }, [socket, isConnected])

  useEvent(EVENTS.MANAGER.GAMES_DATA, (data: GameSummary[]) => {
    setGames(Array.isArray(data) ? data : [])
  })

  useEvent(EVENTS.DISPLAY.STATUS, ({ displays: next }) => {
    setDisplays(Array.isArray(next) ? next : [])
  })

  // The "now" tick only matters while at least one display row is on screen.
  // With no displays nothing depends on `now`, so we skip the interval.
  useEffect(() => {
    if (displays.length === 0) {
      return
    }

    const id = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000))
    }, 1000)

    return () => {
      clearInterval(id)
    }
  }, [displays.length])

  // METRICS.HEALTH is manager-only and only ever emitted while low-latency mode
  // is active; it is gameId-scoped, so we subscribe with the manager's own game
  // id (if any). With no active game there is nothing to scope to: we skip the
  // subscribe AND clear any prior snapshot so an ended game can never leave stale
  // telemetry rendering as live. The cleanup also clears on every gameId change
  // so we never show a different game's numbers across a re-subscribe.
  useEffect(() => {
    if (!isConnected || !gameId) {
      setSnapshot(null)
      return
    }

    socket.emit(EVENTS.METRICS.SUBSCRIBE, { gameId })

    return () => {
      setSnapshot(null)
    }
  }, [socket, isConnected, gameId])

  useEvent(EVENTS.METRICS.HEALTH, (next: MetricsHealthSnapshot) => {
    setSnapshot(next)
  })

  return {
    socket,
    isConnected,
    withToken,
    games,
    displays,
    snapshot,
    apiInfo,
    now,
  }
}
