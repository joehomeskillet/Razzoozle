import clsx from "clsx"
import type { ReactNode } from "react"

export interface ActionFooterProps {
  /** Action buttons (e.g. Save / Reset). */
  children: ReactNode
  className?: string
  /** Optional dirty state indicator. When true, applies subtle visual treatment. */
  dirty?: boolean
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
 * **Layout contract (W2-G2 / #234):** This footer must be a *direct flex child*
 * of the ConsoleShell tabpanel (via fragment siblings is fine). Its content
 * sibling may use `flex-1` to push the bar down on short pages, but must NOT
 * use `min-h-0` — that lets the sibling shrink below content size, spills
 * overflow into the tabpanel scroller, and breaks `position: sticky` so the
 * bar scrolls away mid-panel. Working pattern: `className="flex flex-1 flex-col pb-20"`.
 * Broken pattern: `className="flex min-h-0 flex-1 flex-col pb-20"`.
 *
 * **Dirty state:** When `dirty=true`, the bar applies a subtle opacity reduction
 * to indicate unsaved changes. Parent component manages the dirty flag and button
 * states; ActionFooter is purely presentational.
 *
 * Presentational — children provide the button row.
 */
const ActionFooter = ({ children, className, dirty }: ActionFooterProps) => (
  <div
    className={clsx(
      // Bleed to the tabpanel edges (ConsoleShell tabpanel: p-4 sm:p-6) so the
      // bar sits flush at the very bottom. `sticky bottom` pins the BORDER edge
      // to the container's PADDING edge, so a negative bottom (= -padding) is
      // needed to reach the panel's border bottom — `bottom-0` alone leaves a
      // padding-sized gap. The card's `overflow-hidden rounded-2xl` clips the
      // bottom-RIGHT corner to the card radius; the bottom-LEFT stays square
      // (it abuts the nav rail).
      "sticky -bottom-4 z-10 -mx-4 -mb-4 sm:-mx-6 sm:-bottom-6 sm:-mb-6",
      // Surface — fully opaque so scrolled content never bleeds through.
      // Token-only: use CSS variables for theme flexibility
      "border-t border-[var(--line)] bg-[var(--surface)]",
      // Shadow lifting the bar off scrolled content.
      "shadow-[0_-2px_8px_rgba(0,0,0,0.08)]",
      // Inner padding — horizontal matches bleed compensation, vertical 12px + safe-area
      "px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6",
      // Button row: right-aligned on ≥sm, stacked full-width below sm
      "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end sm:gap-4",
      // Dirty state indicator: subtle opacity reduction
      dirty && "opacity-75",
      className,
    )}
  >
    {children}
  </div>
)

export default ActionFooter
