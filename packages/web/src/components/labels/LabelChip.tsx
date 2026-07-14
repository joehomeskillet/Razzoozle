import clsx from "clsx"
import { X } from "lucide-react"

export interface Label {
  id: number
  name: string
  color: string
}

interface LabelChipProps {
  label: Label
  onRemove?: () => void
}

const colorMap: Record<string, { bg: string; text: string }> = {
  gray: { bg: "bg-gray-100", text: "text-gray-700" },
  violet: { bg: "bg-[var(--color-primary)]", text: "text-white" },
  accent: { bg: "bg-[var(--color-accent)]", text: "text-[var(--accent-contrast-text)]" },
  bronze: { bg: "bg-[var(--tier-bronze)]", text: "text-white" },
  silver: { bg: "bg-[var(--tier-silver)]", text: "text-[var(--answer-text)]" },
  gold: { bg: "bg-[var(--tier-gold)]", text: "text-[var(--answer-text)]" },
  diamant: { bg: "bg-[var(--tier-diamant)]", text: "text-[var(--answer-text)]" },
  red: { bg: "bg-[var(--team-red)]", text: "text-[var(--team-red-text)]" },
  blue: { bg: "bg-[var(--team-blue)]", text: "text-[var(--team-blue-text)]" },
}

export default function LabelChip({ label, onRemove }: LabelChipProps) {
  const colors = colorMap[label.color] || colorMap.gray

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
