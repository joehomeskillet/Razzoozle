import clsx from "clsx"
import type { ReactNode } from "react"

export interface StickyActionsProps {
  /** Action buttons rendered inside the bar (e.g. save / reset). */
  children: ReactNode
  className?: string
}

/**
 * A sticky action bar (spec §A1) pinned to the bottom of a scrollable console
 * panel. Translucent `bg-white/95` surface with a top border and backdrop
 * blur, bleeding into the panel padding via negative margins. Presentational;
 * the action buttons are passed in as children.
 */
const StickyActions = ({ children, className }: StickyActionsProps) => (
  <div
    className={clsx(
      "sticky bottom-0 z-10 -mx-4 -mb-4 flex gap-2 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/80 sm:-mx-6 sm:-mb-6 sm:px-6",
      className,
    )}
  >
    {children}
  </div>
)

export default StickyActions
