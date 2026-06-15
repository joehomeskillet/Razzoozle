import clsx from "clsx"
import type { ReactNode } from "react"

export interface SubGroupProps {
  children: ReactNode
  className?: string
}

/**
 * A sunken sub-surface (spec §A1) for grouping related controls inside a
 * {@link SectionCard}. Light `bg-gray-50` panel with a 1px inset outline.
 * Presentational.
 */
const SubGroup = ({ children, className }: SubGroupProps) => (
  <div
    className={clsx(
      "rounded-xl bg-gray-50 p-3 outline-1 -outline-offset-1 outline-gray-200",
      className,
    )}
  >
    {children}
  </div>
)

export default SubGroup
