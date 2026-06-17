import {
  type AnimationTokens,
  useReveal,
} from "@razzoozle/web/features/game/animation/presets"
import { SectionCard } from "@razzoozle/web/features/manager/components/console"
import LabelRow from "@razzoozle/web/components/ui/LabelRow"
import { Gauge, RefreshCw } from "lucide-react"
import { motion } from "motion/react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

export interface AnimationControlsProps {
  /** The draft animation tokens, read from the parent's editable Theme. */
  value: AnimationTokens
  /** Persist a single token change back into the draft Theme. */
  onChange: (next: AnimationTokens) => void
}

// Slider bounds mirror the zod themeValidator (animation block) exactly so the
// editor can never produce a value the server would reject. Keep in sync with
// packages/common/src/validators/theme.ts.
const SLIDERS: Array<{
  key: keyof AnimationTokens
  min: number
  max: number
  step: number
}> = [
  { key: "springStiffness", min: 50, max: 1000, step: 10 },
  { key: "springDamping", min: 5, max: 60, step: 1 },
  { key: "durationScale", min: 0.25, max: 3, step: 0.05 },
  { key: "staggerScale", min: 0, max: 3, step: 0.05 },
]

// Static mock rows for the live preview — no game state, no secrets.
const PREVIEW_ROWS = [1, 2, 3, 4]

/**
 * AnimationControls — four range sliders that tune the draft theme's
 * `animation` tokens (spring feel, duration + stagger scale), plus a live
 * preview list that re-reveals via `useReveal(value)` so the manager feels the
 * change immediately. A "replay" button remounts the list (key bump) to
 * re-trigger the reveal without persisting anything.
 *
 * The preview drives the DRAFT tokens through `useReveal`'s override argument,
 * so it reflects the sliders without ever touching the document root or the
 * saved theme — the parent's existing handleSave (MANAGER.SET_THEME) carries
 * these fields when the manager saves.
 */
const AnimationControls = ({ value, onChange }: AnimationControlsProps) => {
  const { t } = useTranslation()
  // Bumping this remounts the preview list, re-firing the reveal animation.
  const [replayKey, setReplayKey] = useState(0)
  const reveal = useReveal(value)

  const setToken = (key: keyof AnimationTokens) => (next: number) =>
    onChange({ ...value, [key]: next })

  return (
    <SectionCard
      icon={<Gauge className="size-5" />}
      title={t("manager:theme.animation.title", { defaultValue: "Animation" })}
      description={t("manager:theme.animation.description", {
        defaultValue: "",
      })}
    >
      {SLIDERS.map(({ key, min, max, step }) => {
        const current = value[key]
        const label = t(`manager:theme.animation.${key}`, {
          defaultValue: key,
        })

        return (
          <LabelRow
            key={key}
            label={`${label} (${current})`}
            htmlFor={`theme-anim-${key}`}
          >
            <input
              id={`theme-anim-${key}`}
              type="range"
              min={min}
              max={max}
              step={step}
              value={current}
              aria-label={label}
              aria-valuetext={String(current)}
              onChange={(e) => setToken(key)(Number(e.target.value))}
              className="h-11 w-full cursor-pointer accent-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
            />
          </LabelRow>
        )
      })}

      {/* ── Live-Vorschau ──────────────────────────────────────────────
        Re-reveals with the DRAFT tokens (useReveal(value)). Remounting via
        `replayKey` re-triggers the reveal. Scoped to this box — never writes
        to the document root or the saved theme. */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-gray-500">
          {t("manager:theme.animation.previewLabel", {
            defaultValue: "Vorschau",
          })}
        </span>
        <button
          type="button"
          onClick={() => setReplayKey((k) => k + 1)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-[var(--color-primary)] outline-1 -outline-offset-1 outline-gray-200 transition-colors hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
        >
          <RefreshCw className="size-4" aria-hidden />
          {t("manager:theme.animation.replay", { defaultValue: "Abspielen" })}
        </button>
      </div>

      <motion.ul
        key={replayKey}
        className="flex flex-col gap-2"
        variants={reveal.container()}
        initial="hidden"
        animate="visible"
      >
        {PREVIEW_ROWS.map((row) => (
          <motion.li
            key={row}
            variants={reveal.item()}
            transition={reveal.spring}
            className="flex min-h-11 items-center gap-3 rounded-lg bg-gray-50 px-3 outline-1 -outline-offset-1 outline-gray-200"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--color-primary)] text-xs font-bold text-white">
              {row}
            </span>
            <span className="h-2 flex-1 rounded-full bg-gray-200" aria-hidden />
          </motion.li>
        ))}
      </motion.ul>
    </SectionCard>
  )
}

export default AnimationControls
