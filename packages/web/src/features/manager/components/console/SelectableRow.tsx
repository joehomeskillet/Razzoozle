import clsx from "clsx"
import { Check } from "lucide-react"
import type { ButtonHTMLAttributes, ReactNode } from "react"
import {
  rowShellBase,
  rowRestState,
  rowShellDensity,
  rowHoverState,
  rowSelectedState,
  rowFocusState,
  rowTitleClass,
  rowMetaClass,
  rowLeadingClass,
} from "./rowStyles"

export interface SelectableRowProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "type" | "title" | "children"
  > {
  /** Primary line. */
  title: ReactNode
  /** Optional secondary meta line (e.g. "15 Fragen"). */
  meta?: ReactNode
  /** Optional leading icon/marker slot. */
  leading?: ReactNode
  /** Selected state. */
  selected?: boolean
}

/**
 * A single-choice list row (spec §4.3) — e.g. picking which quiz to start.
 * `role="radio"`; the caller wraps the set in a `role="radiogroup"`.
 *
 * Selected = accent outline + tinted bg + filled check indicator. Unselected =
 * `--line` (gray-200) outline + hollow ring. `p-4`, min-height ≥ 44px, full
 * focus ring. Presentational; selection state is owned by the caller.
 *
 * Shell/state classes from rowStyles (spec §3.1 S4): exclusive state branching
 * so selected replaces rest/hover rather than stacking additively.
 */
const SelectableRow = ({
  title,
  meta,
  leading,
  selected = false,
  className,
  ...buttonProps
}: SelectableRowProps) => (
  <button
    type="button"
    role="radio"
    aria-checked={selected}
    className={clsx(
      "flex min-h-11 w-full items-center gap-3 text-left",
      rowShellBase,
      rowShellDensity.default,
      selected ? rowSelectedState : clsx(rowRestState, rowHoverState),
      rowFocusState,
      className,
    )}
    {...buttonProps}
  >
    {leading && (
      <span className={rowLeadingClass} aria-hidden>
        {leading}
      </span>
    )}

    <span className="flex min-w-0 flex-1 flex-col">
      <span className={rowTitleClass}>{title}</span>
      {meta && <span className={clsx("truncate", rowMetaClass)}>{meta}</span>}
    </span>

    {/* Radio indicator: filled accent disc + check when selected, hollow ring
        otherwise. Decorative — state is on aria-checked. */}
    <span
      aria-hidden
      className={clsx(
        "flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
        selected
          ? "border-[var(--accent-contrast)] bg-[var(--accent-contrast)] text-white" // token-ok: white-on-accent-contrast, AA per tokens.css §design.md
          : "border-[var(--line)] bg-[var(--surface)]",
      )}
    >
      {selected && <Check className="size-4" strokeWidth={3} />}
    </span>
  </button>
)

export default SelectableRow
