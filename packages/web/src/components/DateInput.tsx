import clsx from "clsx"
import type { InputHTMLAttributes } from "react"
import { forwardRef } from "react"
import { twMerge } from "tailwind-merge"

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  className?: string
}

/**
 * Native date input wrapper with D7 focus styling and token-bound colors.
 * Renders <input type="date"> with browser's native date picker.
 * Extends all native HTMLInputElement props except type (fixed to "date").
 *
 * Focus state: 2px outline with offset, using --color-primary for visibility.
 * Disabled state: reduced opacity (60%) + not-allowed cursor.
 * All colors bound to design.md tokens (--surface, --ink, --line, --color-primary).
 */
const baseClasses =
  "w-full min-h-11 px-4 py-3 rounded-[var(--radius-theme)] " +
  "bg-[var(--surface)] text-[var(--ink)] border border-[var(--border-hairline)] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-[var(--color-primary)] " +
  "disabled:cursor-not-allowed disabled:opacity-60"

const DateInput = forwardRef<HTMLInputElement, Props>(
  ({ className, ...otherProps }, ref) => (
    <input
      ref={ref}
      type="date"
      className={twMerge(clsx(baseClasses, className))}
      {...otherProps}
    />
  ),
)

DateInput.displayName = "DateInput"

export default DateInput
