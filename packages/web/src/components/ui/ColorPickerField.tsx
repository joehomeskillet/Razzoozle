import {
  contrastRatio,
  wcagLevel,
} from "@razzia/web/features/manager/components/console/contrast"
import clsx from "clsx"
import { useId } from "react"
import { useTranslation } from "react-i18next"

export interface ColorPickerFieldProps {
  /** Visible label text. */
  label: string
  /** Current colour as a hex string (e.g. "#7c3aed"). */
  value: string
  /** Fired with the new hex string on change. */
  onChange: (hex: string) => void
  /**
   * When set, render a small WCAG contrast pill of `value` vs this colour.
   * Green for AA/AAA pass, amber with "Kontrast schwach" for fail.
   */
  contrastAgainst?: string
  /**
   * When set, render a mini answer-tile preview.
   * `text` = foreground colour, `label` = letter shown in tile (default "A").
   */
  answerPreview?: { text: string; label?: string }
  className?: string
}

/**
 * A label + color-swatch row.
 *
 * Reuses ConfigTheme's color-input pattern: a ≥44px clickable swatch backed
 * by `<input type="color">`, with the hex value shown in monospace. Label sits
 * left, swatch + hex right. Stacks below `sm`.
 *
 * Optional a11y extras: WCAG contrast pill (`contrastAgainst`) and a mini
 * answer-tile preview (`answerPreview`), mirroring ColorSwatchField.
 */
const ColorPickerField = ({
  label,
  value,
  onChange,
  contrastAgainst,
  answerPreview,
  className,
}: ColorPickerFieldProps) => {
  const inputId = useId()
  const { t } = useTranslation()

  const level =
    contrastAgainst !== undefined
      ? wcagLevel(contrastRatio(value, contrastAgainst))
      : null
  const failed = level === "fail"

  const hint = t("manager:theme.contrast.hint", { defaultValue: "Kontrast" })
  const failLabel = t("manager:theme.contrast.fail", {
    defaultValue: "Kontrast schwach",
  })

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

      <div className="flex min-h-11 flex-1 flex-wrap items-center gap-3">
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

        {/* WCAG contrast pill */}
        {level && (
          <span
            title={failed ? `${hint}: ${failLabel}` : `${hint}: ${level}`}
            className={clsx(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.625rem] font-semibold tabular-nums",
              failed
                ? "bg-amber-100 text-amber-700"
                : "bg-green-100 text-green-700",
            )}
          >
            <span className="sr-only">
              {failed ? `${hint}: ${failLabel}` : `${hint}: ${level}`}
            </span>
            {failed ? (
              <>
                <span aria-hidden>!</span>
                {failLabel}
              </>
            ) : (
              level
            )}
          </span>
        )}

        {/* Mini answer-tile preview */}
        {answerPreview && (
          <span
            aria-hidden
            className="flex h-7 items-center justify-center rounded-md px-3 text-xs font-semibold"
            style={{ backgroundColor: value, color: answerPreview.text }}
          >
            {answerPreview.label ?? "A"}
          </span>
        )}
      </div>
    </div>
  )
}

export default ColorPickerField
