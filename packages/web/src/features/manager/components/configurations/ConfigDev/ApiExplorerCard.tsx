import {
  EmptyState,
  ListRow,
  SectionCard,
} from "@razzoozle/web/features/manager/components/console"
import { Activity, KeyRound, PlugZap, ScrollText } from "lucide-react"
import { useTranslation } from "react-i18next"

import { openEndpoint } from "./helpers"

interface ApiExplorerCardProps {
  apiInfo: {
    routes: number
    version: string
    valid: boolean
  } | null
  withToken: (url: string) => string
}

export const ApiExplorerCard = ({
  apiInfo,
  withToken,
}: ApiExplorerCardProps) => {
  const { t } = useTranslation("manager")

  return (
    <SectionCard
      icon={<PlugZap className="size-5" />}
      title={t("dev.api.title")}
      description={t("dev.redactionNotice")}
      actions={
        apiInfo !== null && apiInfo.valid ? (
          <span className="inline-flex items-center rounded-full bg-[var(--status-online-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--status-online-text)]">
            {t("dev.api.schemaValid")}
          </span>
        ) : undefined
      }
    >
      <div className="space-y-3">
        {apiInfo !== null && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--ink-subtle)] tabular-nums">
            <span>
              {apiInfo.routes} {t("dev.api.routes")}
            </span>
            <span>
              {t("dev.api.version")} {apiInfo.version}
            </span>
          </div>
        )}
        <div className="space-y-2">
          <ListRow
            title={t("dev.api.openapi")}
            leading={<PlugZap className="size-5" />}
            onClick={openEndpoint(withToken("/api/openapi.json"))}
            bodyLabel={t("dev.api.openapi")}
          />
          <ListRow
            title={t("dev.api.events")}
            leading={<Activity className="size-5" />}
            onClick={openEndpoint(withToken("/api/v1/observability/events"))}
            bodyLabel={t("dev.api.events")}
          />
          <ListRow
            title={t("dev.api.schema")}
            leading={<ScrollText className="size-5" />}
            onClick={openEndpoint(withToken("/api/v1/observability/schema"))}
            bodyLabel={t("dev.api.schema")}
          />
        </div>
        <EmptyState
          icon={KeyRound}
          headline={t("dev.api.tokensTitle")}
          hint={t("dev.api.tokensEmpty")}
        />
      </div>
    </SectionCard>
  )
}
