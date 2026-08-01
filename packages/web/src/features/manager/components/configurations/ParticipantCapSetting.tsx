import Input from "@razzoozle/web/components/Input"
import Select from "@razzoozle/web/components/Select"
import clsx from "clsx"
import { Users } from "lucide-react"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

export interface ParticipantCapSettingProps {
  value?: number | null // null or 0 = unlimited
  onChange: (cap: number | null) => void
  disabled?: boolean
  testIdPrefix?: string
  className?: string
  /**
   * `card` — full surface card (legacy).
   * `compact` — footer-ready select: Unlimited / 25 / 50 / 100 / 200 / Custom (AF-11 / AF06).
   */
  variant?: "card" | "compact"
}

// Server ceiling is MAX_PLAYERS_PER_GAME = 200; presets stay within this bound
export const CAP_PRESETS = [25, 50, 100, 200, null] as const

const PRESET_VALUES = new Set<number | null>([null, 25, 50, 100, 200])

export function ParticipantCapSetting({
  value = null,
  onChange,
  disabled = false,
  testIdPrefix = "",
  className,
  variant = "card",
}: ParticipantCapSettingProps) {
  const { t } = useTranslation()
  const isCustom =
    value != null && value > 0 && !PRESET_VALUES.has(value)
  const [customMode, setCustomMode] = useState(isCustom)

  const selectValue = useMemo(() => {
    if (customMode || isCustom) return "custom"
    if (value == null || value === 0) return "unlimited"
    return String(value)
  }, [customMode, isCustom, value])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    if (raw === "") {
      onChange(null)
      return
    }
    const num = parseInt(raw, 10)
    if (!isNaN(num) && num >= 0) {
      onChange(num === 0 ? null : Math.min(200, num))
    }
  }

  if (variant === "compact") {
    return (
      <div
        className={clsx("flex min-w-0 flex-col gap-1", className)}
        data-testid={`${testIdPrefix}participant-cap-setting`}
        data-variant="compact"
      >
        <label
          htmlFor={`${testIdPrefix}cap-select`}
          className="text-xs font-medium text-[var(--ink-muted)]"
        >
          {t("manager:cap.title", { defaultValue: "Teilnehmer-Limit" })}
        </label>
        <div className="flex min-h-11 min-w-0 flex-wrap items-center gap-2">
          <Select
            id={`${testIdPrefix}cap-select`}
            value={selectValue}
            disabled={disabled}
            data-testid={`${testIdPrefix}participant-cap-select`}
            className="min-w-[8rem] flex-1"
            onChange={(e) => {
              const v = e.target.value
              if (v === "unlimited") {
                setCustomMode(false)
                onChange(null)
              } else if (v === "custom") {
                setCustomMode(true)
                if (value == null || PRESET_VALUES.has(value)) {
                  onChange(30)
                }
              } else {
                setCustomMode(false)
                onChange(Number(v))
              }
            }}
          >
            <option value="unlimited">
              {t("manager:cap.unlimited", { defaultValue: "Unbegrenzt" })}
            </option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="200">200</option>
            <option value="custom">
              {t("manager:cap.custom", { defaultValue: "Benutzerdefiniert" })}
            </option>
          </Select>
          {(customMode || isCustom) && (
            <Input
              type="number"
              min={1}
              max={200}
              value={value ?? ""}
              onChange={handleInputChange}
              disabled={disabled}
              className="w-24 min-h-11"
              data-testid={`${testIdPrefix}participant-cap-input`}
              aria-label={t("manager:cap.custom", {
                defaultValue: "Benutzerdefiniert",
              })}
            />
          )}
        </div>
      </div>
    )
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
              defaultValue:
                "Maximale Anzahl gleichzeitiger Spieler in der Session",
            })}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-36">
          <Input
            type="number"
            min={0}
            max={200}
            value={value ?? ""}
            onChange={handleInputChange}
            placeholder={t("manager:cap.unlimited", {
              defaultValue: "Unbegrenzt",
            })}
            disabled={disabled}
            data-testid={`${testIdPrefix}participant-cap-input`}
          />
        </div>

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
