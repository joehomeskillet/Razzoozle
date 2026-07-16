import type { GameSummary } from "@razzoozle/common/types/game"
import type { MetricsHealthSnapshot } from "@razzoozle/common/types/game/socket"
import { useConfig } from "@razzoozle/web/features/manager/contexts/config-context"
import {
  EmptyState,
  ListRow,
  SectionCard,
} from "@razzoozle/web/features/manager/components/console"
import { Activity, Gamepad2, PlugZap, ScrollText } from "lucide-react"
import { useTranslation } from "react-i18next"

import { fmtMs, openEndpoint } from "./helpers"
import type { DisplayRow } from "./useDevTelemetry"

interface ObservabilityCardProps {
  isConnected: boolean
  games: GameSummary[]
  snapshot: MetricsHealthSnapshot | null
  displays: DisplayRow[]
  now: number
  withToken: (url: string) => string
}

export const ObservabilityCard = ({
  isConnected,
  games,
  snapshot,
  displays,
  now,
  withToken,
}: ObservabilityCardProps) => {
  const { t } = useTranslation("manager")
  const config = useConfig()

  const rejectedReasons = snapshot ? Object.entries(snapshot.rejected) : []

  // Backend dashboard links are surfaced only when the matching URL is a
  // non-empty string — never a dead link to an unconfigured backend.
  const grafanaUrl = config.observability?.grafanaUrl
  const lokiUrl = config.observability?.lokiUrl
  const prometheusUrl = config.observability?.prometheusUrl

  return (
    <SectionCard
      icon={<Activity className="size-5" />}
      title={t("dev.observability.title")}
      description={t("dev.observability.description")}
      actions={
        <span
          className={
            isConnected
              ? "inline-flex items-center gap-1.5 rounded-full bg-[var(--status-online-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--status-online-text)]"
              : "inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-3)] px-2.5 py-1 text-xs font-semibold text-[var(--ink-subtle)]"
          }
        >
          <span
            aria-hidden
            className={
              isConnected
                ? "size-2 rounded-full bg-[var(--state-correct)]"
                : "size-2 rounded-full bg-[var(--ink-faint)]"
            }
          />
          {t("dev.observability.serverHealth")}
        </span>
      }
    >
      <div className="space-y-4">
        <ListRow
          title={t("dev.observability.serverHealth")}
          leading={<Activity className="size-5" />}
          onClick={openEndpoint("/api/v1/health")}
          bodyLabel={t("dev.observability.serverHealth")}
        />

        <div className="space-y-2">
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
                leading={<Gamepad2 className="size-5" />}
                meta={`${game.playerCount} ${t("dev.observability.players")}`}
              />
            ))
          )}
        </div>

        <div className="space-y-2">
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
        </div>

        <div className="space-y-2">
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
        </div>

        <ListRow
          title={t("dev.observability.eventCatalog")}
          leading={<ScrollText className="size-5" />}
          meta={t("dev.observability.sampledRedacted")}
          onClick={openEndpoint(withToken("/api/v1/observability/events"))}
          bodyLabel={t("dev.observability.eventCatalog")}
        />

        {(typeof grafanaUrl === "string" && grafanaUrl.length > 0) ||
        (typeof lokiUrl === "string" && lokiUrl.length > 0) ||
        (typeof prometheusUrl === "string" && prometheusUrl.length > 0) ? (
          <div className="space-y-2">
            {typeof grafanaUrl === "string" && grafanaUrl.length > 0 && (
              <ListRow
                title={t("dev.observability.grafana")}
                leading={<PlugZap className="size-5" />}
                onClick={openEndpoint(grafanaUrl)}
                bodyLabel={t("dev.observability.grafana")}
              />
            )}
            {typeof lokiUrl === "string" && lokiUrl.length > 0 && (
              <ListRow
                title={t("dev.observability.loki")}
                leading={<PlugZap className="size-5" />}
                onClick={openEndpoint(lokiUrl)}
                bodyLabel={t("dev.observability.loki")}
              />
            )}
            {typeof prometheusUrl === "string" &&
              prometheusUrl.length > 0 && (
                <ListRow
                  title={t("dev.observability.prometheus")}
                  leading={<PlugZap className="size-5" />}
                  onClick={openEndpoint(prometheusUrl)}
                  bodyLabel={t("dev.observability.prometheus")}
                />
              )}
          </div>
        ) : null}
      </div>
    </SectionCard>
  )
}
