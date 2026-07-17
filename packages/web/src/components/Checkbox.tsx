import clsx from "clsx"
import type { InputHTMLAttributes } from "react"
import { forwardRef } from "react"
import { twMerge } from "tailwind-merge"

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: React.ReactNode
}

/**
 * Shared checkbox primitive — native <input type="checkbox"> with optional label.
 *
 * - If `label` is provided, wraps input + label in a <label> element (44px hit target).
 * - If no `label`, renders bare input for caller-supplied labels.
 * - All colors via design.md tokens. D7 focus-visible ring (2px, offset-2, primary).
 * - Forwards ref to the input element; className merges onto the input via twMerge.
 */
const Checkbox = forwardRef<HTMLInputElement, Props>(
  ({ label, className, ...otherProps }, ref) => {
    const inputClasses = twMerge(
      clsx(
        "size-5 rounded border border-[var(--border-hairline)] accent-[var(--color-primary)] cursor-pointer",
        "disabled:cursor-not-allowed disabled:opacity-60",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
        className,
      ),
    )

    const input = (
      <input
        ref={ref}
        type="checkbox"
        className={inputClasses}
        {...otherProps}
      />
    )

    if (label) {
      return (
        <label className="flex items-center gap-3 min-h-11 cursor-pointer">
          {input}
          <span className="text-sm">{label}</span>
        </label>
      )
    }

    return input
  },
)

Checkbox.displayName = "Checkbox"

export default Checkbox
