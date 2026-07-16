import clsx from "clsx"
import type { ReactNode } from "react"

interface BadgeProps {
  children: ReactNode
  className?: string
}

// Structural shell shared by every chip-style pill (Badge itself + LabelChip).
// Callers layer color/tone on top via `className` — never redefine padding,
// radius, or type scale locally (that duplication is what caused the drift
// this primitive fixes).
export const chipBase =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"

// Uniform "assign" trigger optics — one dedicated pill style for opening the
// label/class assignment control everywhere it appears (spec D22c).
export const assignTriggerClass =
  "inline-flex min-h-11 items-center gap-1 rounded-full border border-[var(--border-hairline)] px-2 text-xs font-medium text-[var(--ink-medium)] hover:bg-[var(--surface-2)] focus-visible:outline-[var(--color-primary)]"

const defaultTone = "bg-[var(--surface-4)] text-[var(--ink-muted)]"

const Badge = ({ children, className }: BadgeProps) => {
  return (
    <span className={clsx(chipBase, className || defaultTone)}>
      {children}
    </span>
  )
}

export default Badge
