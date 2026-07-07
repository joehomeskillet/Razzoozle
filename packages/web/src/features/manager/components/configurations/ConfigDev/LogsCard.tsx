import {
  ListRow,
  SectionCard,
} from "@razzoozle/web/features/manager/components/console"
import { Download, ScrollText } from "lucide-react"
import { useTranslation } from "react-i18next"

import { openEndpoint } from "./helpers"

interface LogsCardProps {
  withToken: (url: string) => string
}

export const LogsCard = ({ withToken }: LogsCardProps) => {
  const { t } = useTranslation("manager")

  return (
    <SectionCard
      icon={<ScrollText className="size-5" />}
      title={t("dev.logs.title")}
      description={t("dev.logs.description")}
    >
      <div className="space-y-2">
        <ListRow
          title={t("dev.logs.server")}
          leading={<ScrollText className="size-5" />}
          actions={[
            {
              key: "download-server",
              icon: Download,
              label: t("dev.logs.download"),
              onClick: openEndpoint(
                withToken("/api/v1/observability/logs/server"),
              ),
            },
          ]}
        />
        <ListRow
          title={t("dev.logs.client")}
          leading={<ScrollText className="size-5" />}
          actions={[
            {
              key: "download-client",
              icon: Download,
              label: t("dev.logs.download"),
              onClick: openEndpoint(
                withToken("/api/v1/observability/logs/client"),
              ),
            },
          ]}
        />
      </div>
    </SectionCard>
  )
}
