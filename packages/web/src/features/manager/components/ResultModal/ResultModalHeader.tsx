import * as RadixDialog from "@radix-ui/react-dialog"
import { RESULT_MODAL_TITLE_ID } from "@razzoozle/web/features/manager/components/ResultModal"
import { useResultModal } from "@razzoozle/web/features/manager/contexts/result-modal-context"
import { exportResultCsv } from "@razzoozle/web/features/manager/utils/resultExport"
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const ResultModalHeader = () => {
  const { result, questionIndex, total, goNext, goPrev, displayName } =
    useResultModal()
  const { t } = useTranslation()

  // Dependency-free CSV export of the final ranking (rank, player, points),
  // built client-side from the already-loaded GameResult. `displayName` honours
  // the anonymise toggle, so masked names export as "Spieler N".
  const handleExportCsv = () => {
    exportResultCsv(
      result,
      {
        rank: t("manager:result.table.rank", { defaultValue: "Rang" }),
        player: t("manager:result.table.player"),
        points: t("manager:result.table.points"),
      },
      displayName,
    )

    toast.success(t("manager:result.export.done"))
  }

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-gray-200 px-5 py-3">
      <RadixDialog.Title asChild>
        <h2
          id={RESULT_MODAL_TITLE_ID}
          className="flex-1 truncate text-base font-bold text-gray-900"
        >
          {result.subject}
        </h2>
      </RadixDialog.Title>
      <div className="flex shrink-0 items-center gap-1">
        {/* Whitespace-nowrap keeps the "1 von 5" counter on one line; the
            separator string already carries its own spaces, so we don't add
            extra ones. */}
        <span className="text-sm whitespace-nowrap text-gray-400 tabular-nums">
          {questionIndex + 1}
          {t("manager:result.paginationOf")}
          {total}
        </span>
        <button
          type="button"
          aria-label={t("manager:result.export.csv")}
          title={t("manager:result.export.csv")}
          onClick={handleExportCsv}
          className="rounded p-1 text-gray-500 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500"
        >
          <Download className="size-5" />
        </button>
        <button
          type="button"
          aria-label={t("manager:result.aria.prevQuestion")}
          disabled={questionIndex === 0}
          onClick={goPrev}
          className="rounded p-1 text-gray-500 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500 disabled:opacity-30"
        >
          <ChevronLeft className="size-5" />
        </button>
        <button
          type="button"
          aria-label={t("manager:result.aria.nextQuestion")}
          disabled={questionIndex === total - 1}
          onClick={goNext}
          className="rounded p-1 text-gray-500 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500 disabled:opacity-30"
        >
          <ChevronRight className="size-5" />
        </button>
        {/* Radix Close closes the dialog (→ onOpenChange → onClose); no manual
            onClick needed. */}
        <RadixDialog.Close asChild>
          <button
            type="button"
            aria-label={t("manager:result.aria.close")}
            className="ml-1 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500"
          >
            <X className="size-5" />
          </button>
        </RadixDialog.Close>
      </div>
    </div>
  )
}

export default ResultModalHeader
