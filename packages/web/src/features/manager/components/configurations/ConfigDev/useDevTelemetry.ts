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

  // Append the dev API token (URL-encoded) to a same-origin DEV endpoint URL
  // when one is configured, so the manager's opens/fetches authenticate. The
  // key is never rendered — it only rides along on these dev-route requests.
  const withToken = (url: string): string =>
    config.devApiKey
      ? `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(config.devApiKey)}`
      : url

  const [games, setGames] = useState<GameSummary[]>([])
  const [displays, setDisplays] = useState<DisplayRow[]>([])
  const [snapshot, setSnapshot] = useState<MetricsHealthSnapshot | null>(null)
  // A compact one-shot probe of the self-documenting HTTP surface. This tab only
  // mounts in dev mode, so /api/openapi.json is reachable same-origin. Failures
  // are swallowed: the banner simply stays hidden rather than rendering an error.
  const [apiInfo, setApiInfo] = useState<{
    routes: number
    version: string
    valid: boolean
  } | null>(null)
  // A ticking "now" (epoch seconds) so each display's relative "last seen"
  // re-evaluates every second without a server round-trip.
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))

  // Probe the OpenAPI doc once on mount: route count, declared version, and
  // whether it advertises the OpenAPI 3.1.0 contract. Silent on any failure.
  useEffect(() => {
    fetch(withToken("/api/openapi.json"))
      .then((r) => r.json())
      .then((doc) => {
        setApiInfo({
          routes: Object.keys(doc.paths ?? {}).length,
          version: doc.info?.version ?? "?",
          valid: doc.openapi === "3.1.0",
        })
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.devApiKey])

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
