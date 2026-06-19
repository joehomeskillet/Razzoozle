/**
 * RoundRecapStrip — the per-round recap strip (SPEC-recap.md §C).
 *
 * Renders up to three compact `RoundRecapCard`s in a horizontal, mobile-safe
 * wrapping row on the per-round Result screen. The STRIP owns the
 * first-appearance reveal (container stagger + per-card item variants), while
 * each Card stays presentational (its own optional pulse is reserved for
 * explicit re-emphasis elsewhere — not used here, so no `highlight` is passed).
 *
 * Motion: `motion/react` only, via `useReveal()` — opacity/transform only, no
 * `layout` prop, total under ~3s (default stagger + spring settle). Reduced
 * motion is handled by `useReveal` (stagger → 0, opacity-only fallback).
 *
 * Old SHOW_RESULT payloads carry no `roundRecap`, so an empty `awards` array
 * renders nothing and the Result screen is unchanged.
 */

import type { RoundRecapAward } from "@razzoozle/common/types/game"
import { useReveal } from "@razzoozle/web/features/game/animation/presets"
import { motion } from "motion/react"
import { useTranslation } from "react-i18next"
import RoundRecapCard from "./RoundRecapCard"

interface Props {
  awards: RoundRecapAward[]
}

const RoundRecapStrip = ({ awards }: Props) => {
  const { t } = useTranslation()
  const reveal = useReveal()

  if (awards.length === 0) return null

  const list = awards.slice(0, 3)

  return (
    <div className="mt-4 flex w-full flex-col items-center gap-3">
      <h3 className="text-lg font-bold text-[color:var(--game-fg)]">
        {t("game:roundRecap.title", { defaultValue: "Höhepunkte der Runde" })}
      </h3>

      <motion.div
        variants={reveal.container()}
        initial="hidden"
        animate="visible"
        className="flex flex-wrap items-stretch justify-center gap-3 md:gap-4"
      >
        {list.map((award) => (
          <motion.div
            key={award.key}
            variants={reveal.item()}
            transition={reveal.spring}
            className="flex"
          >
            <RoundRecapCard award={award} />
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}

export default RoundRecapStrip
