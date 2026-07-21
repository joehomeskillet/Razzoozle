import type { ReactNode } from "react"

interface FilterGroupProps {
  /** Visible group label (left on sm+, top on mobile). */
  label: string
  children: ReactNode
  /** Optional a11y name; defaults to `label`. */
  ariaLabel?: string
}

/**
 * Labeled filter-pill group: role=group + visible text-xs label.
 * Responsive: column on mobile, row on sm+.
 */
const FilterGroup = ({ label, children, ariaLabel }: FilterGroupProps) => (
  <div
    role="group"
    aria-label={ariaLabel ?? label}
    className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3"
  >
    <span className="shrink-0 text-xs font-medium text-[var(--ink-subtle)] sm:w-min">
      {label}
    </span>
    <div className="flex flex-wrap items-center gap-2">{children}</div>
  </div>
)

export default FilterGroup
