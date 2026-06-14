import { useId } from "react"

export interface ColorSwatchProps {
  /** Visible label, also the input's accessible name. */
  label: string
  /** Current colour as a hex string (e.g. "#7c3aed"). */
  value: string
  /** Fired with the new hex string on change. */
  onChange: (hex: string) => void
  /** Override the generated input id. */
  id?: string
}

/**
 * One colour swatch (spec §A1) — label + native `<input type=color>` + an
 * uppercase hex readout. 44px min touch target, focus-visible ring in
 * `--color-primary`. Generalised from ConfigTheme's local `colorField`.
 * Presentational; the value/handler are passed in.
 */
const ColorSwatch = ({ label, value, onChange, id }: ColorSwatchProps) => {
  const generatedId = useId()
  const inputId = id ?? generatedId

  return (
    <label
      htmlFor={inputId}
      className="flex flex-col items-center gap-1 text-center text-xs font-medium text-gray-600"
    >
      <input
        id={inputId}
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="size-11 cursor-pointer rounded-lg border border-gray-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
      />
      {label}
      <span className="font-mono text-xs tracking-tight text-gray-500 uppercase tabular-nums">
        {value}
      </span>
    </label>
  )
}

export default ColorSwatch
