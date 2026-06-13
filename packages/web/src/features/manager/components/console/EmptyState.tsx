import clsx from "clsx"
import type { LucideIcon } from "lucide-react"
import Button from "@razzia/web/components/Button"

export interface EmptyStateProps {
  icon: LucideIcon
  /** Headline line (already translated). */
  headline: string
  /** One-line supporting hint. */
  hint?: string
  /** Optional primary action. */
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

/**
 * The single empty-list placeholder (spec §4.6) — replaces the two-gray-`<p>`
 * empties scattered across tabs. Icon + headline + one-line hint + optional
 * primary action (reuses the shared `Button`). Centered, generous padding.
 * Presentational; all strings/handlers are passed in.
 */
const EmptyState = ({
  icon: Icon,
  headline,
  hint,
  action,
  className,
}: EmptyStateProps) => (
  <div
    className={clsx(
      "flex flex-col items-center justify-center gap-3 rounded-xl px-6 py-10 text-center",
      className,
    )}
  >
    <span
      aria-hidden
      className="flex size-14 items-center justify-center rounded-full bg-[var(--accent-tint)] text-[var(--accent-contrast)]"
    >
      <Icon className="size-7" strokeWidth={2} />
    </span>
    <p className="text-lg font-bold text-gray-900">{headline}</p>
    {hint && <p className="max-w-sm text-sm text-gray-500">{hint}</p>}
    {action && (
      <Button
        variant="primary"
        size="md"
        onClick={action.onClick}
        className="mt-1 rounded-xl"
      >
        {action.label}
      </Button>
    )}
  </div>
)

export default EmptyState
