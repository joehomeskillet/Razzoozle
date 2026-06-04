import * as RadixDialog from "@radix-ui/react-alert-dialog"
import { RESULT_MODAL_TITLE_ID } from "@razzia/web/features/manager/components/ResultModal"
import { useResultModal } from "@razzia/web/features/manager/contexts/result-modal-context"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { useTranslation } from "react-i18next"

const ResultModalHeader = () => {
  const { result, questionIndex, total, goNext, goPrev } = useResultModal()
  const { t } = useTranslation()

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
        {/* Radix Cancel closes the dialog (→ onOpenChange → onClose); no manual
            onClick needed. */}
        <RadixDialog.Cancel asChild>
          <button
            type="button"
            aria-label={t("manager:result.aria.close")}
            className="ml-1 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500"
          >
            <X className="size-5" />
          </button>
        </RadixDialog.Cancel>
      </div>
    </div>
  )
}

export default ResultModalHeader
