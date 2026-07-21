import { LABEL_PALETTE } from "./labelPalette"
import { useTranslation } from "react-i18next"

interface LabelColorPickerProps {
  value: string
  onChange: (slug: string) => void
}

const LabelColorPicker = ({ value, onChange }: LabelColorPickerProps) => {
  const { t } = useTranslation()

  return (
    <div>
      <label className="block text-sm font-medium text-[var(--ink)] mb-2">
        {t("manager:labels.colorLabel")}
      </label>
      <div className="flex flex-wrap gap-2">
        {LABEL_PALETTE.map((c) => {
          const colorLabel = t("manager:labels.colors." + c.slug, { defaultValue: c.label })
          return (
            <button
              key={c.slug}
              type="button"
              onClick={() => onChange(c.slug)}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-full"
              title={colorLabel}
              aria-label={colorLabel}
              aria-pressed={value === c.slug}
            >
              <span
                className="size-8 rounded-full border-2 transition-all"
                aria-hidden
                style={{
                  backgroundColor: `var(--label-${c.slug})`,
                  borderColor: value === c.slug ? "var(--color-secondary)" : "var(--border-hairline)",
                  boxShadow: value === c.slug ? "0 0 0 2px white" : "none",
                }}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default LabelColorPicker
