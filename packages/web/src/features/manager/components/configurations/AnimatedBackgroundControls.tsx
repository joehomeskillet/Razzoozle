import type {
  AnimatedBackgroundConfig,
  ThemeBackgrounds,
} from "@razzoozle/common/types/theme"
import LabelRow from "@razzoozle/web/components/ui/LabelRow"
import {
  SectionCard,
  SubGroup,
} from "@razzoozle/web/features/manager/components/console"
import { Sparkles } from "lucide-react"
import { useTranslation } from "react-i18next"

export interface AnimatedBackgroundControlsProps {
  /** The draft's per-slot animated-background config (draft.backgrounds.animated). */
  value: ThemeBackgrounds["animated"]
  /** Persist a per-slot field change back into the draft Theme. */
  onChange: (next: ThemeBackgrounds["animated"]) => void
}

type SlotKey = keyof ThemeBackgrounds["animated"]

const SLOTS: Array<{ key: SlotKey; labelKey: string; fallback: string }> = [
  {
    key: "auth",
    labelKey: "manager:theme.animatedBg.slot.auth",
    fallback: "Start / Beitritt",
  },
  {
    key: "managerGame",
    labelKey: "manager:theme.animatedBg.slot.managerGame",
    fallback: "Host-Bildschirm",
  },
  {
    key: "playerGame",
    labelKey: "manager:theme.animatedBg.slot.playerGame",
    fallback: "Spieler-Handy",
  },
]

const TYPE_OPTIONS: Array<{
  value: AnimatedBackgroundConfig["type"]
  labelKey: string
  fallback: string
}> = [
  {
    value: "none",
    labelKey: "manager:theme.animatedBg.type.none",
    fallback: "Keiner",
  },
  {
    value: "creamBackdrop",
    labelKey: "manager:theme.animatedBg.type.creamBackdrop",
    fallback: "Cream-Backdrop",
  },
]

// Slider bounds mirror the zod themeValidator (animatedBg block) exactly so the
// editor can never produce a value the server would reject. Keep in sync with
// packages/common/src/validators/theme.ts.
const SLIDERS: Array<{
  key: "speed" | "intensity" | "iconCount"
  min: number
  max: number
  step: number
  labelKey: string
  fallback: string
}> = [
  {
    key: "speed",
    min: 0.25,
    max: 3,
    step: 0.05,
    labelKey: "manager:theme.animatedBg.speed",
    fallback: "Geschwindigkeit",
  },
  {
    key: "intensity",
    min: 0,
    max: 1,
    step: 0.05,
    labelKey: "manager:theme.animatedBg.intensity",
    fallback: "Intensität",
  },
  {
    key: "iconCount",
    min: 0,
    max: 12,
    step: 1,
    labelKey: "manager:theme.animatedBg.iconCount",
    fallback: "Symbole",
  },
]

// Range styling — copied from AnimationControls so the slider reads as a themed
// control on the light console surface instead of the raw browser default.
const RANGE_CLASS = [
  "h-11 w-full cursor-pointer appearance-none bg-transparent",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
  // WebKit / Blink track + thumb
  "[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-gray-200",
  "[&::-webkit-slider-thumb]:-mt-[5px] [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--color-primary)] [&::-webkit-slider-thumb]:shadow-sm",
  // Firefox / Gecko track + thumb
  "[&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-gray-200",
  "[&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[var(--color-primary)] [&::-moz-range-thumb]:shadow-sm",
].join(" ")

/**
 * AnimatedBackgroundControls — edits `draft.backgrounds.animated` per slot
 * (auth / managerGame / playerGame). Each slot has a type selector
 * (none | creamBackdrop) plus three range sliders (speed / intensity /
 * iconCount). Slider bounds mirror the zod themeValidator (animatedBg) so the
 * editor can never produce a rejected value — keep in sync with
 * packages/common/src/validators/theme.ts. Saving rides the unchanged
 * MANAGER.SET_THEME flow (these fields live under the draft's backgrounds).
 */
const AnimatedBackgroundControls = ({
  value,
  onChange,
}: AnimatedBackgroundControlsProps) => {
  const { t } = useTranslation()

  const setField =
    (slotKey: SlotKey, field: keyof AnimatedBackgroundConfig) =>
    (next: AnimatedBackgroundConfig[keyof AnimatedBackgroundConfig]) =>
      onChange({
        ...value,
        [slotKey]: { ...value[slotKey], [field]: next },
      })

  return (
    <SectionCard
      icon={<Sparkles className="size-5" />}
      title={t("manager:theme.animatedBg.title", {
        defaultValue: "Animierter Hintergrund",
      })}
    >
      {SLOTS.map((slot) => {
        const config = value[slot.key]
        const disabled = config.type === "none"

        return (
          <SubGroup key={slot.key}>
            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold text-gray-700">
                {t(slot.labelKey, { defaultValue: slot.fallback })}
              </p>

              {/* Type selector — segmented two-button group. */}
              <div
                role="radiogroup"
                aria-label={t(slot.labelKey, { defaultValue: slot.fallback })}
                className="inline-flex rounded-lg bg-gray-100 p-1 outline-1 -outline-offset-1 outline-gray-200"
              >
                {TYPE_OPTIONS.map((option) => {
                  const active = config.type === option.value

                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() =>
                        setField(slot.key, "type")(option.value)
                      }
                      className={`min-h-9 rounded-md px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] ${
                        active
                          ? "bg-white text-gray-900 shadow-sm"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {t(option.labelKey, { defaultValue: option.fallback })}
                    </button>
                  )
                })}
              </div>

              {/* Speed / intensity / iconCount sliders. Disabled when type=none. */}
              {SLIDERS.map(({ key, min, max, step, labelKey, fallback }) => {
                const current = config[key]
                const label = t(labelKey, { defaultValue: fallback })
                const inputId = `anim-bg-${slot.key}-${key}`

                return (
                  <LabelRow
                    key={key}
                    label={`${label} (${current})`}
                    htmlFor={inputId}
                  >
                    <input
                      id={inputId}
                      type="range"
                      min={min}
                      max={max}
                      step={step}
                      value={current}
                      disabled={disabled}
                      aria-label={label}
                      aria-valuetext={String(current)}
                      onChange={(e) =>
                        setField(slot.key, key)(Number(e.target.value))
                      }
                      className={
                        disabled ? `${RANGE_CLASS} opacity-50` : RANGE_CLASS
                      }
                    />
                  </LabelRow>
                )
              })}
            </div>
          </SubGroup>
        )
      })}
    </SectionCard>
  )
}

export default AnimatedBackgroundControls
