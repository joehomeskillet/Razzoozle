/**
 * RoundRecapCard — one compact award card for the per-round recap strip.
 * A smaller sibling of the end-game `RecapSequence` card:
 * same white liquid-glass surface, emoji medal disc, ink label/name, and value
 * pill, but tighter padding for a horizontal strip.
 *
 * Motion: this card is a `motion.div` ONLY so it can own an optional re-emphasis
 * pulse via `highlight`. First-appearance reveal is owned by the parent Strip
 * (which wraps each card in its own `motion.div variants={reveal.item()}`), so
 * we intentionally do NOT use `reveal.pop()` here. When `highlight && !reduced`
 * the card plays a one-shot `scale: [1, 1.06, 1]` re-emphasis; otherwise it is
 * static (no `animate`). Reduced motion → no pulse (gated on `reveal.reduced`).
 *
 * Pure presentation: labels from i18n (`game:roundRecap.<key>`, du-form German
 * fallbacks, no exclamation marks), emoji mapped locally in formatRoundRecap.
 */

import type { RoundRecapAward, RoundRecapKey } from "@razzoozle/common/types/game"
import Avatar from "@razzoozle/web/components/Avatar"
import { useReveal } from "@razzoozle/web/features/game/animation/presets"
import { motion } from "motion/react"
import { useTranslation } from "react-i18next"
import {
  ROUND_RECAP_EMOJI,
  formatRoundRecapValue,
  roundRecapLabelKey,
} from "./formatRoundRecap"

interface Props {
  award: RoundRecapAward
  /** Re-emphasis pulse on an already-visible card (scale only, reduced-safe). */
  highlight?: boolean
}

// German fallbacks (du-form, no exclamation marks).
const LABEL_FALLBACK: Record<RoundRecapKey, string> = {
  fastest_finger: "Schnellster Finger",
  first_correct: "Erste richtige Antwort",
  streak: "Serie",
  highest_round_score: "Beste Rundenpunkte",
  rank_climber: "Grösster Aufsteiger",
  achievement_unlock: "Bonus freigeschaltet",
  slowest_player: "Langsamster",
  most_wrong: "Meisten falschen Antworten",
}

const RoundRecapCard = ({ award, highlight = false }: Props) => {
  const { t } = useTranslation()
  const reveal = useReveal()

  const value = formatRoundRecapValue(award.key, award.value)
  const pulse = highlight && !reveal.reduced

  return (
    <motion.div
      animate={pulse ? { scale: [1, 1.06, 1] } : undefined}
      transition={pulse ? reveal.tween() : undefined}
      className="flex h-full w-40 flex-col items-center gap-2 rounded-3xl border border-[var(--border-hairline)] bg-white px-4 py-4 text-center shadow-xl md:w-44 md:px-5 md:py-5"
    >
      <span
        className="flex size-14 items-center justify-center rounded-full border-4 border-[var(--border-hairline)] bg-gray-100 text-3xl md:size-16 md:text-4xl"
        aria-hidden
      >
        {ROUND_RECAP_EMOJI[award.key]}
      </span>

      <p className="text-base font-extrabold text-[color:var(--color-field-ink)] md:text-lg">
        {t(roundRecapLabelKey(award.key), {
          defaultValue: LABEL_FALLBACK[award.key],
        })}
      </p>

      <Avatar src={award.winnerAvatar} name={award.winnerName} size={40} />
      <p className="font-black text-[color:var(--color-field-ink)]">
        {award.winnerName}
      </p>

      {value ? (
        <p className="rounded-full border border-[var(--border-hairline)] bg-gray-100 px-3 py-1 text-sm font-bold text-[color:var(--color-field-ink)] tabular-nums md:text-base">
          {value}
        </p>
      ) : (
        <span className="h-8" aria-hidden />
      )}
    </motion.div>
  )
}

export default RoundRecapCard
