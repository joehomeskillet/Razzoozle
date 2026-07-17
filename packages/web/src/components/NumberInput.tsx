import clsx from "clsx"
import type { InputHTMLAttributes } from "react"
import { forwardRef } from "react"
import { twMerge } from "tailwind-merge"

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  className?: string
}

/**
 * NumberInput — a native `<input type="number">` wrapper styled to the D7 spec.
 * Extends InputHTMLAttributes to pass through min, max, step, value, onChange,
 * disabled, etc. All colors and spacing bound to design.md tokens (no raw hex).
 *
 * Focus-visible ring (outline-2, offset-2) uses --color-primary for contrast.
 * Disabled state reduces opacity to 60% and sets cursor-not-allowed.
 */
const NumberInput = forwardRef<HTMLInputElement, Props>(
  ({ className, ...otherProps }, ref) => (
    <input
      ref={ref}
      type="number"
      className={twMerge(
        clsx(
          "w-full min-h-11 px-4 py-3",
          "rounded-[var(--radius-theme)]",
          "bg-[var(--surface)] text-[var(--ink)]",
          "border border-[var(--border-hairline)]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
          "disabled:cursor-not-allowed disabled:opacity-60",
          className,
        ),
      )}
      {...otherProps}
    />
  ),
)

NumberInput.displayName = "NumberInput"

export default NumberInput
