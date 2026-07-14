import clsx from "clsx"
import { X } from "lucide-react"
import { getLabelColor } from "./labelPalette"

export interface Label {
  id: number
  name: string
  color: string
}

interface LabelChipProps {
  label: Label
  onRemove?: () => void
}

export default function LabelChip({ label, onRemove }: LabelChipProps) {
  const colors = getLabelColor(label.color)

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium border border-[var(--border-hairline)]",
        colors.bg,
        colors.text,
      )}
    >
      {label.name}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label.name}`}
          className="ml-0.5 inline-flex items-center justify-center text-current hover:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-primary)] rounded"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </span>
  )
}
