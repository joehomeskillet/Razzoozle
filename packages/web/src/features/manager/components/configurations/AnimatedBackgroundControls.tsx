import type {
  AnimatedBackgroundConfig,
  ThemeBackgrounds,
} from "@razzoozle/common/types/theme"
import ColorPickerField from "@razzoozle/web/components/ui/ColorPickerField"
import LabelRow from "@razzoozle/web/components/ui/LabelRow"
import {
  SectionCard,
  SubGroup,
} from "@razzoozle/web/features/manager/components/console"
import { Sparkles } from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

type SlotKey = keyof ThemeBackgrounds["animated"]

export interface AnimatedBackgroundControlsProps {
  /** The draft's per-slot animated-background config (draft.backgrounds.animated). */
  value: ThemeBackgrounds["animated"]
  /** Persist a per-slot field change back into the draft Theme. */
  onChange: (next: ThemeBackgrounds["animated"]) => void
  /** Custom CSS for the animated background (draft.backgrounds.animatedCss). */
  cssValue: string
  /** Persist the CSS edit back into the draft Theme. */
  onCssChange: (next: string) => void
  /** Render the relocated static-wallpaper upload tile for a slot (wallpaper mode). */
  renderWallpaperUpload?: (slot: SlotKey) => ReactNode
}

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
 * (auth / managerGame / playerGame). Each slot is a clean ON/OFF toggle:
 * ON → type "creamBackdrop" (animated) revealing the three range sliders
 * (speed / intensity / iconCount); OFF → type "none" (wallpaper), sliders
 * hidden. Slider bounds mirror the zod themeValidator (animatedBg) so the
 * editor can never produce a rejected value — keep in sync with
 * packages/common/src/validators/theme.ts. A single global CSS editor at the
 * bottom edits `draft.backgrounds.animatedCss`. Saving rides the unchanged
 * MANAGER.SET_THEME flow (these fields live under the draft's backgrounds).
 */
const AnimatedBackgroundControls = ({
  value,
  onChange,
  cssValue,
  onCssChange,
  renderWallpaperUpload,
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
        const animatedOn = config.type === "creamBackdrop"
        const switchId = `anim-bg-${slot.key}-toggle`

        return (
          <SubGroup key={slot.key}>
            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold text-gray-700">
                {t(slot.labelKey, { defaultValue: slot.fallback })}
              </p>

              {/* ON/OFF toggle switch — animated ⇄ wallpaper. */}
              <div className="flex items-center gap-3">
                <button
                  id={switchId}
                  type="button"
                  role="switch"
                  aria-checked={animatedOn}
                  aria-label={t("manager:theme.animatedBg.toggle", {
                    defaultValue: "Animierter Hintergrund",
                  })}
                  onClick={() =>
                    setField(slot.key, "type")(
                      animatedOn ? "none" : "creamBackdrop",
                    )
                  }
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] ${
                    animatedOn ? "bg-[var(--color-primary)]" : "bg-gray-300"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`inline-block size-5 transform rounded-full bg-white shadow-sm transition-transform ${
                      animatedOn ? "translate-x-[22px]" : "translate-x-0.5"
                    }`}
                  />
                </button>
                <label
                  htmlFor={switchId}
                  className="text-sm font-medium text-gray-600"
                >
                  {animatedOn
                    ? t("manager:theme.animatedBg.mode.animated", {
                        defaultValue: "Animiert",
                      })
                    : t("manager:theme.animatedBg.mode.wallpaper", {
                        defaultValue: "Wallpaper",
                      })}
                </label>
              </div>

              {animatedOn ? (
                <>
                  <ColorPickerField
                    label={t("manager:theme.animatedBg.color", {
                      defaultValue: "Farbe",
                    })}
                    value={config.color || "#7c3aed"}
                    onChange={setField(slot.key, "color")}
                  />
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
                          aria-label={label}
                          aria-valuetext={String(current)}
                          onChange={(e) =>
                            setField(slot.key, key)(Number(e.target.value))
                          }
                          className={RANGE_CLASS}
                        />
                      </LabelRow>
                    )
                  })}
                </>
              ) : (
                renderWallpaperUpload && (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-medium text-gray-500">
                      {t("manager:theme.animatedBg.wallpaper", {
                        defaultValue: "Hintergrundbild",
                      })}
                    </p>
                    {renderWallpaperUpload(slot.key)}
                  </div>
                )
              )}
            </div>
          </SubGroup>
        )
      })}

      {/* ── CSS editor (global, rides the draft save) ─────────────────── */}
      <SubGroup>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-gray-700">
            {t("manager:theme.animatedBg.css.title", {
              defaultValue: "CSS-Editor",
            })}
          </p>
          <p className="text-sm text-gray-500">
            {t("manager:theme.animatedBg.css.description", {
              defaultValue:
                "Eigenes CSS für den animierten Hintergrund (z. B. .cb-blob, Keyframes überschreiben).",
            })}
          </p>
          <label htmlFor="anim-bg-css" className="sr-only">
            {t("manager:theme.animatedBg.css.title", {
              defaultValue: "CSS-Editor",
            })}
          </label>
          <textarea
            id="anim-bg-css"
            value={cssValue}
            onChange={(e) => onCssChange(e.target.value)}
            spellCheck={false}
            rows={12}
            placeholder={t("manager:theme.animatedBg.css.placeholder", {
              defaultValue:
                "/* .cream-backdrop .cb-blob--a { background: ... } */",
            })}
            className="min-h-48 w-full resize-y rounded-lg bg-gray-900 p-3 font-mono text-sm text-gray-100 outline-1 -outline-offset-1 outline-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
          />
        </div>
      </SubGroup>
    </SectionCard>
  )
}

export default AnimatedBackgroundControls
