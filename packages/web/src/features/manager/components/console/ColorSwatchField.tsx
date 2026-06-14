import clsx from "clsx"
import { useTranslation } from "react-i18next"

import ColorSwatch from "@razzia/web/features/manager/components/console/ColorSwatch"
import {
  contrastRatio,
  wcagLevel,
} from "@razzia/web/features/manager/components/console/contrast"

export interface ColorSwatchFieldProps {
  /** Visible label, also the input's accessible name. */
  label: string
  /** Current colour as a hex string (e.g. "#7c3aed"). */
  value: string
  /** Fired with the new hex string on change. */
  onChange: (hex: string) => void
  /** Override the generated input id. */
  id?: string
  /** When set, show a WCAG contrast badge of `value` against this colour. */
  contrastAgainst?: string
  /** When set, show a mini answer-tile preview using `value` as background. */
  answerPreview?: { text: string; label?: string }
}

/**
 * Thin wrapper around {@link ColorSwatch} (spec §A1) — renders the swatch
 * unchanged, then optionally a WCAG contrast pill and/or a mini answer-tile
 * preview so the admin sees the real result. Presentational; the colour input
 * itself is never forked.
 */
const ColorSwatchField = ({
  label,
  value,
  onChange,
  id,
  contrastAgainst,
  answerPreview,
}: ColorSwatchFieldProps) => {
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
    <div className="flex flex-col items-center gap-1.5">
      <ColorSwatch label={label} value={value} onChange={onChange} id={id} />

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
  )
}

export default ColorSwatchField
