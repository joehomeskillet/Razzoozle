import clsx from "clsx"
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
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(null)}
        aria-pressed={activeId === null}
        className={clsx(
          "inline-flex min-h-9 items-center rounded-full px-3 text-sm font-semibold outline-2 -outline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
          activeId === null
            ? "bg-[var(--accent-tint)] text-[var(--accent-contrast)] outline-[var(--color-primary)]"
            : "bg-gray-100 text-gray-600 hover:bg-gray-200",
        )}
      >
        Alle
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
              "inline-flex min-h-9 items-center rounded-full px-3 text-sm font-semibold outline-2 -outline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
              active
                ? clsx(colors.bg, colors.text, "outline-[var(--color-primary)]")
                : "bg-gray-100 text-gray-600 hover:bg-gray-200",
            )}
          >
            {label.name}
          </button>
        )
      })}
    </div>
  )
}
