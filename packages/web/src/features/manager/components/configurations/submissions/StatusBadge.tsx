import type { SubmissionStatus } from "@razzoozle/common/types/submission"
import Badge from "@razzoozle/web/components/manager/Badge"
import { CheckCircle2, Inbox, XCircle } from "lucide-react"
import { useTranslation } from "react-i18next"

// Small status badge for the approved / rejected history cards.
export const StatusBadge = ({ status }: { status: SubmissionStatus }) => {
  const { t } = useTranslation()

  if (status === "approved") {
    return (
      <Badge className="gap-1.5 bg-[var(--status-online-bg)] text-[var(--status-online-text)]">
        <CheckCircle2 className="size-3.5" aria-hidden />
        {t("manager:submissions.statusFilter.approved", {
          defaultValue: "Angenommen",
        })}
      </Badge>
    )
  }

  if (status === "rejected") {
    return (
      <Badge className="gap-1.5 bg-[var(--status-offline-bg)] text-[var(--status-offline-text)]">
        <XCircle className="size-3.5" aria-hidden />
        {t("manager:submissions.statusFilter.rejected", {
          defaultValue: "Abgelehnt",
        })}
      </Badge>
    )
  }

  return (
    <Badge className="gap-1.5 bg-[var(--status-pending-bg)] text-[var(--status-pending-text)]">
      <Inbox className="size-3.5" aria-hidden />
      {t("manager:submissions.statusFilter.pending", {
        defaultValue: "Offen",
      })}
    </Badge>
  )
}
