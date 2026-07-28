import Input from "@razzoozle/web/components/Input"
import clsx from "clsx"
import { Users } from "lucide-react"
import { useTranslation } from "react-i18next"

export interface ParticipantCapSettingProps {
  value?: number | null // null or 0 = unlimited
  onChange: (cap: number | null) => void
  disabled?: boolean
  testIdPrefix?: string
  className?: string
}

export const CAP_PRESETS = [25, 50, 100, 250, 500, null] as const

export function ParticipantCapSetting({
  value = null,
  onChange,
  disabled = false,
  testIdPrefix = "",
  className,
}: ParticipantCapSettingProps) {
  const { t } = useTranslation()

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    if (raw === "") {
      onChange(null)
      return
    }
    const num = parseInt(raw, 10)
    if (!isNaN(num) && num >= 0) {
      onChange(num === 0 ? null : num)
    }
  }

  return (
    <div
      className={clsx(
        "flex w-full flex-col gap-4 rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--surface-1)] p-6 shadow-[var(--shadow-flat)]",
        className,
      )}
      data-testid={`${testIdPrefix}participant-cap-setting`}
    >
      <div className="flex items-center gap-2 border-b border-[var(--border-hairline)] pb-4">
        <Users className="h-5 w-5 text-[var(--color-primary)]" />
        <div>
          <h3 className="text-xl font-bold text-[var(--ink)]">
            {t("manager:cap.title", { defaultValue: "Teilnehmer-Limit" })}
          </h3>
          <p className="text-xs font-semibold text-[var(--ink-muted)]">
            {t("manager:cap.subtitle", {
              defaultValue: "Maximale Anzahl gleichzeitiger Spieler in der Session",
            })}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-36">
          <Input
            type="number"
            min={0}
            max={5000}
            value={value ?? ""}
            onChange={handleInputChange}
            placeholder={t("manager:cap.unlimited", { defaultValue: "Unbegrenzt" })}
            disabled={disabled}
            data-testid={`${testIdPrefix}participant-cap-input`}
          />
        </div>

        {/* Preset Pills */}
        <div className="flex flex-wrap gap-2" role="group">
          {CAP_PRESETS.map((preset) => {
            const isSelected = value === preset

            return (
              <button
                key={preset === null ? "unlimited" : preset}
                type="button"
                onClick={() => !disabled && onChange(preset)}
                disabled={disabled}
                className={clsx(
                  "rounded-lg px-3 py-2 text-xs font-bold transition-all border",
                  isSelected
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white" // token-ok: white-on-primary, AA per design.md §8·B D6
                    : "border-[var(--border-hairline)] bg-[var(--surface-2)] text-[var(--ink-medium)] hover:bg-[var(--surface-3)]",
                  disabled && "cursor-not-allowed opacity-60",
                )}
                data-testid={`${testIdPrefix}cap-preset-${preset === null ? "unlimited" : preset}`}
              >
                {preset === null
                  ? t("manager:cap.unlimited", { defaultValue: "Unbegrenzt" })
                  : `${preset}`}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
