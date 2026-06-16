import { EVENTS } from "@razzoozle/common/constants"
import type { GameSummary } from "@razzoozle/common/types/game"
import type { MetricsHealthSnapshot } from "@razzoozle/common/types/game/socket"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzoozle/web/features/game/stores/manager"
import { useConfig } from "@razzoozle/web/features/manager/contexts/config-context"
import {
  EmptyState,
  ListRow,
  SectionCard,
} from "@razzoozle/web/features/manager/components/console"
import { Activity, Gamepad2, KeyRound, PlugZap } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

// Dev tab — a read-only "developer console" for the manager. Two stacked
// SectionCards: an API Explorer that opens the self-documenting HTTP surface,
// and a live Observability panel wired to the existing manager socket events
// (LIST_GAMES / GAMES_DATA, DISPLAY.STATUS, METRICS.SUBSCRIBE / HEALTH). It only
// reuses already-shipped contracts — it adds neither a new event nor a new dep.
//
// Redaction notice: passwords, API tokens and answer solutions are never logged.
// That promise is surfaced as the API Explorer's description so it stays visible.

interface DisplayRow {
  socketId: string
  name: string
  lastPingAt: number // epoch seconds (dayjs().unix())
}

// Format a millisecond percentile value: "—" when null (no samples yet),
// otherwise a rounded integer with a "ms" suffix. Mirrors LowLatencyHealth so
// answerAck.p50/p95 read as "12ms" but a pre-answer null reads as "—" rather
// than a fabricated raw number.
const fmtMs = (value: number | null | undefined): string =>
  typeof value === "number" && Number.isFinite(value)
    ? `${Math.round(value)}ms`
    : "—"

// Open a same-origin dev endpoint in a new tab without giving it window.opener.
const openEndpoint = (url: string) => () => {
  window.open(url, "_blank", "noopener")
}

const ConfigDev = () => {
  const { socket, isConnected } = useSocket()
  const { t } = useTranslation("manager")
  const config = useConfig()
  // The manager's own current game — the same source LowLatencyHealth scopes to.
  // null whenever no game is live, which lets us tear down stale telemetry.
  const { gameId } = useManagerStore()

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
    fetch("/api/openapi.json")
      .then((r) => r.json())
      .then((doc) => {
        setApiInfo({
          routes: Object.keys(doc.paths ?? {}).length,
          version: doc.info?.version ?? "?",
          valid: doc.openapi === "3.1.0",
        })
      })
      .catch(() => {})
  }, [])

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

  const rejectedReasons = snapshot ? Object.entries(snapshot.rejected) : []

  // Backend dashboard links are surfaced only when the matching URL is a
  // non-empty string — never a dead link to an unconfigured backend.
  const grafanaUrl = config.observability?.grafanaUrl
  const lokiUrl = config.observability?.lokiUrl
  const prometheusUrl = config.observability?.prometheusUrl

  return (
    <div className="space-y-4">
      <SectionCard
        icon={<PlugZap className="size-5" />}
        title={t("dev.api.title")}
        description={t("dev.redactionNotice")}
      >
        <div className="space-y-3">
          {apiInfo !== null && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 tabular-nums">
              <span>
                {apiInfo.routes} {t("dev.api.routes")}
              </span>
              <span>
                {t("dev.api.version")} {apiInfo.version}
              </span>
              {apiInfo.valid && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                  {t("dev.api.schemaValid")}
                </span>
              )}
            </div>
          )}
          <ListRow
            title={t("dev.api.openapi")}
            onClick={openEndpoint("/api/openapi.json")}
            bodyLabel={t("dev.api.openapi")}
          />
          <ListRow
            title={t("dev.api.events")}
            onClick={openEndpoint("/api/v1/observability/events")}
            bodyLabel={t("dev.api.events")}
          />
          <ListRow
            title={t("dev.api.schema")}
            onClick={openEndpoint("/api/v1/observability/schema")}
            bodyLabel={t("dev.api.schema")}
          />
          <EmptyState
            icon={KeyRound}
            headline={t("dev.api.tokensTitle")}
            hint={t("dev.api.tokensEmpty")}
          />
        </div>
      </SectionCard>

      <SectionCard
        icon={<Activity className="size-5" />}
        title={t("dev.observability.title")}
        description={t("dev.observability.description")}
      >
        <div className="space-y-3">
          <ListRow
            title={t("dev.observability.serverHealth")}
            onClick={openEndpoint("/api/v1/health")}
            bodyLabel={t("dev.observability.serverHealth")}
          />

          {games.length === 0 ? (
            <EmptyState
              icon={Gamepad2}
              headline={t("dev.observability.noGames")}
            />
          ) : (
            games.map((game) => (
              <ListRow
                key={game.gameId}
                title={game.subject}
                meta={`${game.playerCount} ${t("dev.observability.players")}`}
              />
            ))
          )}

          {snapshot === null ? (
            <EmptyState
              icon={Activity}
              headline={t("dev.observability.metricsOffTitle")}
              hint={t("dev.observability.metricsOffHint")}
            />
          ) : (
            <>
              <ListRow
                title={t("dev.observability.reconnects")}
                meta={
                  <span className="tabular-nums">
                    {snapshot.reconnectCount}
                  </span>
                }
              />
              <ListRow
                title={t("dev.observability.rejected")}
                meta={
                  rejectedReasons.length === 0 ? (
                    <span className="tabular-nums">0</span>
                  ) : (
                    <span className="tabular-nums">
                      {rejectedReasons
                        .map(([reason, count]) => `${reason}: ${count}`)
                        .join(" · ")}
                    </span>
                  )
                }
              />
              <ListRow
                title={t("dev.observability.answerLatency")}
                meta={
                  <span className="tabular-nums">
                    {`p50 ${fmtMs(snapshot.answerAck.p50)} · p95 ${fmtMs(snapshot.answerAck.p95)}`}
                  </span>
                }
              />
            </>
          )}

          {displays.length === 0 ? (
            <EmptyState
              icon={Activity}
              headline={t("dev.observability.noDisplays")}
            />
          ) : (
            displays.map((display) => (
              <ListRow
                key={display.socketId}
                title={display.name}
                meta={
                  <span className="tabular-nums">
                    {t("display.status.lastSeen", {
                      seconds: Math.max(0, now - display.lastPingAt),
                    })}
                  </span>
                }
              />
            ))
          )}

          <ListRow
            title={t("dev.observability.eventCatalog")}
            meta={t("dev.observability.sampledRedacted")}
            onClick={openEndpoint("/api/v1/observability/events")}
            bodyLabel={t("dev.observability.eventCatalog")}
          />

          {typeof grafanaUrl === "string" && grafanaUrl.length > 0 && (
            <ListRow
              title={t("dev.observability.grafana")}
              onClick={openEndpoint(grafanaUrl)}
              bodyLabel={t("dev.observability.grafana")}
            />
          )}
          {typeof lokiUrl === "string" && lokiUrl.length > 0 && (
            <ListRow
              title={t("dev.observability.loki")}
              onClick={openEndpoint(lokiUrl)}
              bodyLabel={t("dev.observability.loki")}
            />
          )}
          {typeof prometheusUrl === "string" && prometheusUrl.length > 0 && (
            <ListRow
              title={t("dev.observability.prometheus")}
              onClick={openEndpoint(prometheusUrl)}
              bodyLabel={t("dev.observability.prometheus")}
            />
          )}
        </div>
      </SectionCard>
    </div>
  )
}

export default ConfigDev
