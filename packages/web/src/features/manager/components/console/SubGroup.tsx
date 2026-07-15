import clsx from "clsx"
import type { ReactNode } from "react"

export interface SubGroupProps {
  children: ReactNode
  className?: string
}

/**
 * A sunken sub-surface (spec §A1) for grouping related controls inside a
 * {@link SectionCard}. Light `bg-[var(--surface-2)]` panel with a 1px inset outline.
 * Presentational.
 */
const SubGroup = ({ children, className }: SubGroupProps) => (
  <div
    className={clsx(
      "rounded-xl bg-[var(--surface-2)] p-3 outline-1 -outline-offset-1 outline-[var(--line)]",
      className,
    )}
  >
    {children}
  </div>
)

export default SubGroup
