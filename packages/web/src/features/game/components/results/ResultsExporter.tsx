import Button from "@razzoozle/web/components/Button"
import clsx from "clsx"
import { FileSpreadsheet, FileText, Image as ImageIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

export interface PodiumEntry {
  rank: number
  username: string
  score: number
  avatar?: string
}

export interface ResultsExporterProps {
  quizTitle: string
  podium: PodiumEntry[]
  totalParticipants: number
  onExportPng?: () => void
  onExportPdf?: () => void
  onExportCsv?: () => void
  disabled?: boolean
  testIdPrefix?: string
  className?: string
}

export function ResultsExporter({
  quizTitle,
  podium,
  totalParticipants,
  onExportPng,
  onExportPdf,
  onExportCsv,
  disabled = false,
  testIdPrefix = "",
  className,
}: ResultsExporterProps) {
  const { t } = useTranslation()

  return (
    <div
      className={clsx(
        "mx-auto flex w-full max-w-xl flex-col gap-6 rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--surface-1)] p-6 shadow-[var(--shadow-flat)] text-center",
        className,
      )}
      data-testid={`${testIdPrefix}results-exporter`}
    >
      <div className="space-y-1">
        <h3 className="text-xl font-bold text-[var(--ink)]">
          {t("game:results.exportTitle", { defaultValue: "Ergebnisse exportieren" })}
        </h3>
        <p className="text-xs font-semibold text-[var(--ink-muted)]">
          {quizTitle} • {totalParticipants} Spieler
        </p>
      </div>

      {/* Podium Preview */}
      <div
        className="flex flex-col gap-2 rounded-xl bg-[var(--surface-2)] p-4"
        data-testid={`${testIdPrefix}results-podium-preview`}
      >
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--ink-muted)]">
          Top 3 Gewinner
        </span>
        <div className="flex justify-center gap-4">
          {podium.slice(0, 3).map((entry) => (
            <div key={entry.rank} className="flex flex-col items-center">
              <span className="text-sm font-bold text-[var(--ink)]">
                #{entry.rank} {entry.username}
              </span>
              <span className="text-xs font-semibold text-[var(--color-primary)]">
                {entry.score} Pkt.
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Export Action Buttons */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || !onExportPng}
          onClick={onExportPng}
          data-testid={`${testIdPrefix}export-png`}
        >
          <ImageIcon className="mr-1.5 h-4 w-4" />
          PNG Grafikecke
        </Button>

        <Button
          type="button"
          variant="secondary"
          disabled={disabled || !onExportPdf}
          onClick={onExportPdf}
          data-testid={`${testIdPrefix}export-pdf`}
        >
          <FileText className="mr-1.5 h-4 w-4" />
          PDF Bericht
        </Button>

        <Button
          type="button"
          variant="secondary"
          disabled={disabled || !onExportCsv}
          onClick={onExportCsv}
          data-testid={`${testIdPrefix}export-csv`}
        >
          <FileSpreadsheet className="mr-1.5 h-4 w-4" />
          CSV Daten
        </Button>
      </div>
    </div>
  )
}
