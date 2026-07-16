import clsx from "clsx"
import { Check } from "lucide-react"
import type { ButtonHTMLAttributes, ReactNode } from "react"

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
      "flex min-h-11 w-full items-center gap-3 rounded-[var(--radius-theme)] p-4 text-left transition-colors",
      "outline-2 -outline-offset-2",
      "focus-visible:outline-[var(--color-primary)] focus-visible:outline-offset-2",
      selected
        ? "bg-[var(--accent-tint)] outline-[var(--color-primary)]"
        : "bg-[var(--surface)] outline-[var(--line)] hover:bg-[var(--surface-2)]",
      className,
    )}
    {...buttonProps}
  >
    {leading && (
      <span className="flex shrink-0 items-center text-[var(--ink-faint)]" aria-hidden>
        {leading}
      </span>
    )}

    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate font-semibold text-[var(--ink)]">{title}</span>
      {meta && <span className="truncate text-sm text-[var(--ink-subtle)]">{meta}</span>}
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
