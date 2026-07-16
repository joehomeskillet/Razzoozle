import clsx from "clsx"
import { useTranslation } from "react-i18next"
import type { Label } from "./LabelChip"
import { getLabelColor } from "./labelPalette"

interface LabelFilterPillsProps {
  labels: Label[]
  activeId: number | null
  onChange: (id: number | null) => void
}

export default function LabelFilterPills({
  labels,
  activeId,
  onChange,
}: LabelFilterPillsProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(null)}
        aria-pressed={activeId === null}
        className={clsx(
          "inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold outline-2 -outline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
          activeId === null
            ? "bg-[var(--accent-tint)] text-[var(--accent-contrast)] outline-[var(--color-primary)]"
            : "bg-surface-3 text-ink-medium hover:bg-surface-4",
        )}
      >
        {t("manager:labels.filterAll", { defaultValue: "Alle" })}
      </button>
      {labels.map((label) => {
        const active = activeId === label.id
        const colors = getLabelColor(label.color)

        return (
          <button
            key={label.id}
            type="button"
            onClick={() => onChange(label.id)}
            aria-pressed={active}
            className={clsx(
              "inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold outline-2 -outline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
              active
                ? clsx(colors.bg, colors.text, "outline-[var(--color-primary)]")
                : "bg-surface-3 text-ink-medium hover:bg-surface-4",
            )}
          >
            {label.name}
          </button>
        )
      })}
    </div>
  )
}
