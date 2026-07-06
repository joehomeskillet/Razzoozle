import type { SubmissionStatus } from "@razzoozle/common/types/submission"
import { CheckCircle2, Inbox, XCircle } from "lucide-react"
import { useTranslation } from "react-i18next"

// Small status badge for the approved / rejected history cards.
export const StatusBadge = ({ status }: { status: SubmissionStatus }) => {
  const { t } = useTranslation()

  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
        <CheckCircle2 className="size-3.5" aria-hidden />
        {t("manager:submissions.statusFilter.approved", {
          defaultValue: "Angenommen",
        })}
      </span>
    )
  }

  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
        <XCircle className="size-3.5" aria-hidden />
        {t("manager:submissions.statusFilter.rejected", {
          defaultValue: "Abgelehnt",
        })}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
      <Inbox className="size-3.5" aria-hidden />
      {t("manager:submissions.statusFilter.pending", {
        defaultValue: "Offen",
      })}
    </span>
  )
}
