import clsx from "clsx"
import { useTranslation } from "react-i18next"

export type ConfidenceLevel = "high" | "medium" | "low"

export interface ConfidenceSelectorProps {
  value?: ConfidenceLevel
  onChange: (level: ConfidenceLevel) => void
  disabled?: boolean
  testIdPrefix?: string
  className?: string
}

export function ConfidenceSelector({
  value,
  onChange,
  disabled = false,
  testIdPrefix = "",
  className,
}: ConfidenceSelectorProps) {
  const { t } = useTranslation()

  const levels: Array<{ id: ConfidenceLevel; label: string; tone: string }> = [
    {
      id: "high",
      label: t("game:confidence.high", { defaultValue: "100% Sicher" }),
      tone: "bg-status-online-bg text-status-online-text border-status-online-text/30",
    },
    {
      id: "medium",
      label: t("game:confidence.medium", { defaultValue: "Unsicher" }),
      tone: "bg-status-pending-bg text-status-pending-text border-status-pending-text/30",
    },
    {
      id: "low",
      label: t("game:confidence.low", { defaultValue: "Geraten" }),
      tone: "bg-status-offline-bg text-status-offline-text border-status-offline-text/30",
    },
  ]

  return (
    <div
      className={clsx(
        "flex flex-col gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-2)] p-4 shadow-sm",
        className,
      )}
      data-testid={`${testIdPrefix}confidence-container`}
    >
      <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
        {t("game:confidence.prompt", { defaultValue: "Wie sicher bist du?" })}
      </span>

      <div
        className="flex flex-wrap gap-2"
        role="radiogroup"
        aria-label={t("game:confidence.prompt", { defaultValue: "Wie sicher bist du?" })}
      >
        {levels.map((item) => {
          const isSelected = value === item.id

          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={disabled}
              onClick={() => !disabled && onChange(item.id)}
              className={clsx(
                "inline-flex min-h-11 items-center rounded-lg border px-4 py-2 text-sm font-bold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
                isSelected
                  ? `${item.tone} ring-2 ring-[var(--color-primary)] ring-offset-1`
                  : "border-[var(--border-hairline)] bg-[var(--surface-1)] text-[var(--ink-medium)] hover:bg-[var(--surface-3)]",
                disabled && "cursor-not-allowed opacity-60",
              )}
              data-testid={`${testIdPrefix}confidence-option-${item.id}`}
            >
              {item.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
