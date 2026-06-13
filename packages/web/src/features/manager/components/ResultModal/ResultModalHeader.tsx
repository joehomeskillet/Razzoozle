import * as RadixDialog from "@radix-ui/react-dialog"
import { RESULT_MODAL_TITLE_ID } from "@razzia/web/features/manager/components/ResultModal"
import { useResultModal } from "@razzia/web/features/manager/contexts/result-modal-context"
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

// Quote a single CSV field per RFC 4180: wrap in double quotes and double any
// embedded quote, so commas/quotes/newlines in a username can't break the grid.
// Also neutralise CSV/formula injection: a value beginning with =,+,-,@,tab or
// CR is treated as a formula by Excel/Sheets, so prefix it with a single quote.
const csvField = (value: string | number) => {
  let s = String(value)
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`
  }
  return `"${s.replace(/"/g, '""')}"`
}

// Build a deterministic, spreadsheet-friendly filename from the game subject +
// date. Strips anything that isn't a safe path char so the download never
// produces a slash/colon that confuses the OS.
const csvFilename = (subject: string, date: string) => {
  const slug = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[^\w-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
  const day = new Date(date).toISOString().slice(0, 10)
  const base = [slug(subject), day].filter(Boolean).join("-") || "ergebnis"

  return `${base}.csv`
}

const ResultModalHeader = () => {
  const { result, questionIndex, total, goNext, goPrev } = useResultModal()
  const { t } = useTranslation()

  // Dependency-free CSV export of the final ranking: header row + one row per
  // player (rank, username, points), built client-side from the already-loaded
  // GameResult and downloaded via a transient object-URL anchor.
  const handleExportCsv = () => {
    const header = [
      t("manager:result.table.player"),
      t("manager:result.table.points"),
    ]
    const rows = [...result.players]
      .sort((a, b) => a.rank - b.rank)
      .map((p) => [p.rank, p.username, p.points])
    // Prepend the rank column header; "#" reads as "rank" across all locales
    // and keeps the grid aligned with the data rows below.
    const lines = [["#", ...header], ...rows].map((cols) =>
      cols.map(csvField).join(","),
    )
    // Leading BOM so Excel opens UTF-8 names (umlauts/accents) correctly.
    const csv = `﻿${lines.join("\r\n")}\r\n`

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = csvFilename(result.subject, result.date)
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)

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
