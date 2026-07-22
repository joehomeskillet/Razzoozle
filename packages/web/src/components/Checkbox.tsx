import clsx from "clsx"
import type { InputHTMLAttributes } from "react"
import { forwardRef, useEffect, useRef } from "react"
import { twMerge } from "tailwind-merge"

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: React.ReactNode
  indeterminate?: boolean
}

/**
 * Shared checkbox primitive — native <input type="checkbox"> with optional label.
 *
 * - If `label` is provided, wraps input + label in a <label> element (44px hit target).
 * - If no `label`, renders bare input for caller-supplied labels.
 * - All colors via design.md tokens. D7 focus-visible ring (2px, offset-2, primary).
 * - `indeterminate` shows the native "mixed" dash (for select-all tri-states).
 *   It is a DOM-only property, so it is applied via ref in an effect.
 * - Forwards ref to the input element; className merges onto the input via twMerge.
 */
const Checkbox = forwardRef<HTMLInputElement, Props>(
  ({ label, className, indeterminate = false, ...otherProps }, ref) => {
    const innerRef = useRef<HTMLInputElement | null>(null)

    // `indeterminate` can't be set via an HTML attribute, only the property.
    useEffect(() => {
      if (innerRef.current) {
        innerRef.current.indeterminate = indeterminate
      }
    }, [indeterminate])

    const setRefs = (node: HTMLInputElement | null) => {
      innerRef.current = node
      if (typeof ref === "function") {
        ref(node)
      } else if (ref) {
        ref.current = node
      }
    }

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
        ref={setRefs}
        type="checkbox"
        aria-checked={indeterminate ? "mixed" : undefined}
        className={inputClasses}
        {...otherProps}
      />
    )

    if (label) {
      return (
        <label
          className={clsx(
            "flex items-center gap-3 min-h-11",
            otherProps.disabled
              ? "cursor-not-allowed opacity-60"
              : "cursor-pointer",
          )}
        >
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
