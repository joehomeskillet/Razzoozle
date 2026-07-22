import clsx from "clsx"
import type { ReactNode } from "react"

interface BadgeProps {
  children: ReactNode
  tone?: BadgeTone
  className?: string
}

export type BadgeTone = "neutral" | "primary" | "success" | "warning" | "danger"

// Structural shell shared by every chip-style pill (Badge itself + LabelChip).
// Callers layer color/tone on top via `className` — never redefine padding,
// radius, or type scale locally (that duplication is what caused the drift
// this primitive fixes).
export const chipBase =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"

// Tone-Klassen für Badge-Komponente (SDD manager-row-system §7, R8)
const TONES: Record<BadgeTone, string> = {
  neutral: "bg-[var(--surface-4)] text-[var(--ink-muted)]",
  primary: "bg-[var(--accent-tint)] text-[var(--accent-contrast)]",
  success: "bg-[var(--status-online-bg)] text-[var(--status-online-text)]",
  warning: "bg-[var(--status-pending-bg)] text-[var(--status-pending-text)]",
  danger: "bg-[var(--status-offline-bg)] text-[var(--status-offline-text)]",
}

// Uniform "assign" trigger optics — one dedicated pill style for opening the
// label/class assignment control everywhere it appears. Kompakte Pill ~24px,
// Touch ≥44px via before-Pseudo. SDD manager-row-system §7 (R9)
export const assignTriggerClass =
  "relative inline-flex items-center gap-1 rounded-full border border-[var(--border-hairline)] px-2 py-0.5 text-xs font-medium text-[var(--ink-medium)] hover:bg-[var(--accent-tint)] hover:text-[var(--accent-contrast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] before:absolute before:-inset-2.5 before:content-['']"

const defaultTone = "bg-[var(--surface-4)] text-[var(--ink-muted)]"

const Badge = ({ children, tone, className }: BadgeProps) => {
  return (
    <span className={clsx(chipBase, tone ? TONES[tone] : (className ? undefined : defaultTone), className)}>
      {children}
    </span>
  )
}

export default Badge
