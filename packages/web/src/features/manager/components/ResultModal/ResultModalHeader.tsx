import * as RadixDialog from "@radix-ui/react-dialog"
import Button from "@razzoozle/web/components/Button"
import { RESULT_MODAL_TITLE_ID } from "@razzoozle/web/features/manager/components/ResultModal"
import { useResultModal } from "@razzoozle/web/features/manager/contexts/result-modal-context"
import {
  exportQuestionsCsv,
  exportResultCsv,
  exportResultJson,
  type QuestionsCsvLabels,
} from "@razzoozle/web/features/manager/utils/resultExport"
import { ChevronLeft, ChevronRight, Download, FileJson, FileText, X } from "lucide-react"
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

  // Export full GameResult as JSON for complete data ownership.
  const handleExportJson = () => {
    exportResultJson(result)
    toast.success(t("manager:result.export.done"))
  }

  // Export per-question per-player answers as CSV.
  const handleExportQuestionsCsv = () => {
    const labels: QuestionsCsvLabels = {
      questionNo: t("manager:result.table.questionNo", { defaultValue: "Frage" }),
      question: t("manager:result.table.question", { defaultValue: "Frage" }),
      player: t("manager:result.table.player"),
      answer: t("manager:result.table.answered", { defaultValue: "Antwort" }),
      correct: t("manager:result.table.correctIncorrect", {
        defaultValue: "Korrekt",
      }),
      responseMs: t("manager:result.table.responseMs", {
        defaultValue: "Antwortzeit (ms)",
      }),
      yes: t("manager:result.table.yes", { defaultValue: "Ja" }),
      no: t("manager:result.table.no", { defaultValue: "Nein" }),
    }

    exportQuestionsCsv(result, labels, displayName)
    toast.success(t("manager:result.export.done"))
  }

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-[var(--line)] px-5 py-3">
      <RadixDialog.Title asChild>
        <h2
          id={RESULT_MODAL_TITLE_ID}
          className="flex-1 truncate text-base font-semibold text-[var(--ink)]"
        >
          {result.subject}
        </h2>
      </RadixDialog.Title>
      <div className="flex shrink-0 items-center gap-1">
        {/* Whitespace-nowrap keeps the "1 von 5" counter on one line; the
            separator string already carries its own spaces, so we don't add
            extra ones. */}
        <span className="text-sm whitespace-nowrap text-[var(--ink-faint)] tabular-nums">
          {questionIndex + 1}
          {t("manager:result.paginationOf")}
          {total}
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("manager:result.export.csv", { defaultValue: "CSV" })}
          title={t("manager:result.export.csv", { defaultValue: "CSV" })}
          onClick={handleExportCsv}
        >
          <Download className="size-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("manager:aria.exportQuestionsCsv")}
          title={t("manager:aria.exportQuestionsCsv")}
          onClick={handleExportQuestionsCsv}
        >
          <FileText className="size-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("manager:result.export.json", {
            defaultValue: "JSON",
          })}
          title={t("manager:result.export.json", { defaultValue: "JSON" })}
          onClick={handleExportJson}
        >
          <FileJson className="size-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("manager:result.aria.prevQuestion")}
          disabled={questionIndex === 0}
          onClick={goPrev}
        >
          <ChevronLeft className="size-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("manager:result.aria.nextQuestion")}
          disabled={questionIndex === total - 1}
          onClick={goNext}
        >
          <ChevronRight className="size-5" />
        </Button>
        {/* Radix Close closes the dialog (→ onOpenChange → onClose); no manual
            onClick needed. */}
        <RadixDialog.Close asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("manager:result.aria.close")}
            className="ml-1"
          >
            <X className="size-5" />
          </Button>
        </RadixDialog.Close>
      </div>
    </div>
  )
}

export default ResultModalHeader
