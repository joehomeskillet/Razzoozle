import clsx from "clsx"
import { useId } from "react"

export interface ColorPickerFieldProps {
  /** Visible label text. */
  label: string
  /** Current colour as a hex string (e.g. "#7c3aed"). */
  value: string
  /** Fired with the new hex string on change. */
  onChange: (hex: string) => void
  className?: string
}

/**
 * A label + color-swatch row.
 *
 * Reuses ConfigTheme's color-input pattern: a ≥44px clickable swatch backed
 * by `<input type="color">`, with the hex value shown in monospace. Label sits
 * left, swatch + hex right. Stacks below `sm`.
 */
const ColorPickerField = ({
  label,
  value,
  onChange,
  className,
}: ColorPickerFieldProps) => {
  const inputId = useId()

  return (
    <div className={clsx("flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4", className)}>
      <label
        htmlFor={inputId}
        className={clsx(
          "shrink-0 cursor-pointer text-sm font-medium text-gray-700 sm:w-40",
          "flex min-h-11 items-center",
        )}
      >
        {label}
      </label>

      <div className="flex min-h-11 flex-1 items-center gap-3">
        {/* Swatch button — the label tag above opens the color picker */}
        <label
          htmlFor={inputId}
          aria-hidden
          className="relative cursor-pointer"
        >
          <span
            className="block size-11 rounded-lg border border-gray-200 shadow-sm"
            style={{ backgroundColor: value }}
          />
          <input
            id={inputId}
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label={label}
            className="sr-only"
          />
        </label>

        <span className="font-mono text-xs tracking-tight text-gray-500 uppercase tabular-nums">
          {value}
        </span>
      </div>
    </div>
  )
}

export default ColorPickerField
