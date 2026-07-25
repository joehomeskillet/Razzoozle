import Button from "@razzoozle/web/components/Button"
import clsx from "clsx"
import { FileUp, FileText, Sparkles, CheckCircle2 } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

export interface ExtractedPage {
  pageNumber: number
  summary: string
  selected: boolean
}

export interface DocumentContentExtractorModalProps {
  onGenerateQuiz?: (selectedPages: number[]) => void
  disabled?: boolean
  testIdPrefix?: string
  className?: string
}

export function DocumentContentExtractorModal({
  onGenerateQuiz,
  disabled = false,
  testIdPrefix = "",
  className,
}: DocumentContentExtractorModalProps) {
  const { t } = useTranslation()
  const [fileName, setFileName] = useState<string | null>(null)
  const [pages, setPages] = useState<ExtractedPage[]>([])
  const [isProcessing, setIsProcessing] = useState(false)

  const handleSimulatedUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setIsProcessing(true)

    // Simulate AI document extraction parsing
    setTimeout(() => {
      setPages([
        { pageNumber: 1, summary: "Einführung & Übersicht der Themen", selected: true },
        { pageNumber: 2, summary: "Definitionen & Kernkonzepte", selected: true },
        { pageNumber: 3, summary: "Zusammenfassung & Fallstudien", selected: false },
      ])
      setIsProcessing(false)
    }, 400)
  }

  const togglePage = (pageNumber: number) => {
    setPages((prev) =>
      prev.map((p) => (p.pageNumber === pageNumber ? { ...p, selected: !p.selected } : p)),
    )
  }

  const handleGenerate = () => {
    const selectedNums = pages.filter((p) => p.selected).map((p) => p.pageNumber)
    onGenerateQuiz?.(selectedNums)
  }

  return (
    <div
      className={clsx(
        "flex w-full flex-col gap-6 rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--surface-1)] p-6 shadow-[var(--shadow-flat)]",
        className,
      )}
      data-testid={`${testIdPrefix}document-extractor-modal`}
    >
      <div className="flex items-center gap-2 border-b border-[var(--border-hairline)] pb-4">
        <Sparkles className="h-5 w-5 text-[var(--color-primary)]" />
        <div>
          <h3 className="text-xl font-bold text-[var(--ink)]">
            {t("manager:extractor.title", { defaultValue: "KI Dokument-Extraktor" })}
          </h3>
          <p className="text-xs font-semibold text-[var(--ink-muted)]">
            {t("manager:extractor.subtitle", {
              defaultValue: "PDF oder PowerPoint hochladen & automatisch Quiz erstellen",
            })}
          </p>
        </div>
      </div>

      {/* File Upload Drop Area */}
      {!fileName ? (
        <label
          className={clsx(
            "flex min-h-[160px] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[var(--border-hairline)] bg-[var(--surface-2)] p-6 cursor-pointer hover:bg-[var(--surface-3)] transition-colors",
            disabled && "cursor-not-allowed opacity-60",
          )}
          data-testid={`${testIdPrefix}extractor-dropzone`}
        >
          <FileUp className="h-8 w-8 text-[var(--color-primary)]" />
          <div className="text-center">
            <span className="text-sm font-bold text-[var(--ink)]">
              PDF oder PPTX Datei auswählen
            </span>
            <p className="text-xs text-[var(--ink-muted)]">Bis zu 50 Seiten pro Dokument</p>
          </div>
          <input
            type="file"
            accept=".pdf,.pptx,.ppt"
            disabled={disabled}
            onChange={handleSimulatedUpload}
            className="hidden"
            data-testid={`${testIdPrefix}extractor-file-input`}
          />
        </label>
      ) : (
        <div className="flex items-center gap-3 rounded-xl bg-[var(--surface-2)] p-4">
          <FileText className="h-6 w-6 text-[var(--color-primary)]" />
          <div className="flex-1">
            <p className="text-sm font-bold text-[var(--ink)]">{fileName}</p>
            <p className="text-xs text-[var(--ink-muted)]">
              {isProcessing ? "KI analysiert Dokument..." : `${pages.length} Seiten erkannt`}
            </p>
          </div>
        </div>
      )}

      {/* Extracted Pages Selection List */}
      {pages.length > 0 && (
        <div className="flex flex-col gap-3" data-testid={`${testIdPrefix}extractor-pages-list`}>
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--ink-muted)]">
            Relevante Seiten auswählen
          </span>

          {pages.map((p) => (
            <div
              key={p.pageNumber}
              onClick={() => !disabled && togglePage(p.pageNumber)}
              className={clsx(
                "flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-colors",
                p.selected
                  ? "border-[var(--color-primary)] bg-accent-tint/10"
                  : "border-[var(--border-hairline)] bg-[var(--surface-2)]",
              )}
              data-testid={`${testIdPrefix}extractor-page-${p.pageNumber}`}
            >
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-[var(--color-primary)]">
                  S. {p.pageNumber}
                </span>
                <span className="text-sm font-medium text-[var(--ink)]">{p.summary}</span>
              </div>

              {p.selected && <CheckCircle2 className="h-4 w-4 text-[var(--color-primary)]" />}
            </div>
          ))}

          <Button
            type="button"
            variant="primary"
            disabled={disabled || !pages.some((p) => p.selected)}
            onClick={handleGenerate}
            data-testid={`${testIdPrefix}extractor-generate-btn`}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Quiz aus Ausgewählten Generieren
          </Button>
        </div>
      )}
    </div>
  )
}
