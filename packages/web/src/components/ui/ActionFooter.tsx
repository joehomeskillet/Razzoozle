import clsx from "clsx"
import type { ReactNode } from "react"

export interface ActionFooterProps {
  /** Action buttons (e.g. Save / Reset). */
  children: ReactNode
  className?: string
}

/**
 * Sticky bottom bar pinned to the bottom of a scrollable console panel.
 *
 * The ConsoleShell tabpanel uses `p-4 sm:p-6`. The negative-margin bleed
 * `-mx-4 -mb-4 sm:-mx-6 sm:-mb-6` cancels those paddings exactly so the bar
 * spans the full panel width without any visible gap. The `pt-3 pb-3` plus
 * `pb-[calc(0.75rem+env(safe-area-inset-bottom))]` keeps buttons comfortable
 * on iOS notch devices.
 *
 * Presentational — children provide the button row.
 */
const ActionFooter = ({ children, className }: ActionFooterProps) => (
  <div
    className={clsx(
      // Bleed to panel edges (ConsoleShell tabpanel: p-4 sm:p-6)
      "sticky bottom-0 z-10 -mx-4 -mb-4 sm:-mx-6 sm:-mb-6",
      // Surface
      "border-t border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80",
      // Shadow
      "shadow-[0_-1px_4px_rgba(0,0,0,0.06)]",
      // Inner padding — horizontal matches bleed compensation, vertical 12px + safe-area
      "px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6",
      // Button row: right-aligned on ≥sm, stacked full-width below sm
      "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end sm:gap-4",
      className,
    )}
  >
    {children}
  </div>
)

export default ActionFooter
