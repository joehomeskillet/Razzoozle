import type { SubmissionStatus } from "@razzoozle/common/types/submission"
import Badge from "@razzoozle/web/components/manager/Badge"
import { CheckCircle2, Inbox, XCircle } from "lucide-react"
import { useTranslation } from "react-i18next"

// Small status badge for the approved / rejected history cards.
export const StatusBadge = ({ status }: { status: SubmissionStatus }) => {
  const { t } = useTranslation()

  if (status === "approved") {
    return (
      <Badge tone="success" className="gap-1.5">
        <CheckCircle2 className="size-3.5" aria-hidden />
        {t("manager:submissions.statusFilter.approved", {
          defaultValue: "Angenommen",
        })}
      </Badge>
    )
  }

  if (status === "rejected") {
    return (
      <Badge tone="danger" className="gap-1.5">
        <XCircle className="size-3.5" aria-hidden />
        {t("manager:submissions.statusFilter.rejected", {
          defaultValue: "Abgelehnt",
        })}
      </Badge>
    )
  }

  return (
    <Badge tone="warning" className="gap-1.5">
      <Inbox className="size-3.5" aria-hidden />
      {t("manager:submissions.statusFilter.pending", {
        defaultValue: "Offen",
      })}
    </Badge>
  )
}
