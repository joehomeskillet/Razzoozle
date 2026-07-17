import clsx from "clsx"
import type { InputHTMLAttributes, ReactNode } from "react"
import { forwardRef } from "react"
import { twMerge } from "tailwind-merge"

/**
 * Radio — native radio input with optional label wrapper.
 *
 * Renders a `<input type="radio">` with optional label. If `label` is provided,
 * wraps both in a `<label>` element with a 44px touch target. Extends native
 * InputHTMLAttributes for full control (name, value, checked, onChange, disabled, etc).
 *
 * Focus state uses D7 ring (outline-2, offset-2, accent color).
 * Disabled state reduces opacity to 60%. Input size is 5×5 (size-5).
 *
 * Forwards ref to the underlying <input> element.
 */
type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: ReactNode
}

const Radio = forwardRef<HTMLInputElement, Props>(
  ({ label, className, ...otherProps }, ref) => {
    const inputClasses = twMerge(
      clsx(
        "size-5 accent-[var(--color-primary)] cursor-pointer",
        "disabled:opacity-60",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
        className,
      ),
    )

    const input = (
      <input ref={ref} type="radio" className={inputClasses} {...otherProps} />
    )

    if (!label) {
      return input
    }

    return (
      <label className="flex items-center gap-3 min-h-11 cursor-pointer">
        {input}
        <span className="text-sm font-medium text-[var(--ink)]">{label}</span>
      </label>
    )
  },
)

Radio.displayName = "Radio"

/**
 * RadioGroup — a typed wrapper for managing multiple Radio inputs.
 *
 * Renders a `role="radiogroup"` container of Radio components. Each option
 * is linked to the same `name` and controlled by the shared `value` and `onChange`.
 *
 * Props:
 *   name — shared radio group name attribute
 *   value — the currently selected option value
 *   onChange — fired with the new value when a radio is clicked
 *   options — array of { value, label, disabled? }
 *   className — optional container classes (default: flex flex-col gap-2)
 */
export interface RadioGroupOption {
  value: string
  label: ReactNode
  disabled?: boolean
}

export interface RadioGroupProps {
  name: string
  value: string
  onChange: (value: string) => void
  options: RadioGroupOption[]
  className?: string
}

export const RadioGroup = forwardRef<
  HTMLDivElement,
  RadioGroupProps
>(
  ({ name, value, onChange, options, className }, ref) => (
    <div
      ref={ref}
      role="radiogroup"
      className={twMerge(clsx("flex flex-col gap-2", className))}
    >
      {options.map((option) => (
        <Radio
          key={option.value}
          name={name}
          value={option.value}
          label={option.label}
          checked={value === option.value}
          onChange={() => onChange(option.value)}
          disabled={option.disabled}
        />
      ))}
    </div>
  ),
)

RadioGroup.displayName = "RadioGroup"

export default Radio
