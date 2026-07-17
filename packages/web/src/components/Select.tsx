import clsx from "clsx"
import type { PropsWithChildren, SelectHTMLAttributes } from "react"
import { forwardRef } from "react"
import { twMerge } from "tailwind-merge"

type Props = SelectHTMLAttributes<HTMLSelectElement> &
  PropsWithChildren & {
    className?: string
  }

/**
 * Native `<select>` wrapper primitive. Extends native select attributes,
 * forwards ref for direct DOM access, and applies token-bound styling.
 *
 * Base classes: consistent min-height touch target (44px), token-bound
 * colors, rounded radius (theme var), border, and D7 focus-visible ring
 * (2px, offset-2, --color-primary). Disabled state: cursor + opacity.
 *
 * Children are `<option>` elements passed by the caller.
 *
 * @example
 * <Select value={selected} onChange={(e) => setSelected(e.target.value)}>
 *   <option value="a">Option A</option>
 *   <option value="b">Option B</option>
 * </Select>
 */
const Select = forwardRef<HTMLSelectElement, Props>(
  ({ children, className, ...otherProps }, ref) => (
    <select
      ref={ref}
      className={twMerge(
        clsx(
          "min-h-11 w-full sm:w-auto px-3 py-2 rounded-[var(--radius-theme)] " +
            "bg-[var(--surface)] text-[var(--ink)] border border-[var(--border-hairline)] " +
            "font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 " +
            "focus-visible:outline-[var(--color-primary)] disabled:cursor-not-allowed " +
            "disabled:opacity-60",
          className,
        ),
      )}
      {...otherProps}
    >
      {children}
    </select>
  ),
)

Select.displayName = "Select"

export default Select
