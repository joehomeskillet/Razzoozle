/**
 * RecapSequence — manager big-screen superlative reveal that plays BEFORE the
 * podium. Walks the awarded `superlatives` one card at a time (click to advance
 * + an auto-advance timer), each card showing a playful German label + emoji for
 * the award key, the winner name, and the formatted value. Ends on a "Podium"
 * cue and calls `onComplete` so the parent can flip to the podium reveal.
 *
 * A11y: the card content lives in a non-interactive `role="region"`
 * (aria-live="polite") so screen readers announce the award label, winner, and
 * value. Advancing is driven by a real, focusable "Weiter" button; the
 * click-anywhere layer is a non-essential, aria-hidden enhancement on top. The
 * auto-advance timer can be paused/resumed (WCAG 2.2.2) and is paused while the
 * region is hovered or focused.
 *
 * Reduced-motion safe via `useReveal` (opacity-only fallback, no fabricated
 * motion). Pure presentation: no socket / store writes — labels come from i18n
 * (`game:recap.superlative.<key>`) with the emoji mapped locally.
 */

import type { Superlative, SuperlativeKey } from "@razzoozle/common/types/game"
import Avatar from "@razzoozle/web/components/Avatar"
import { useReveal } from "@razzoozle/web/features/game/animation/presets"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

interface Props {
  superlatives: Superlative[]
  /** Fired once the final "Podium" cue has been shown (or the sequence skipped). */
  onComplete?: () => void
  /** ms each superlative card stays before auto-advancing. */
  autoAdvanceMs?: number
  /** When true, cards auto-advance (10s each); when false the user advances manually. */
  autoMode?: boolean
}

// Playful emoji per award key — labels themselves live in i18n (du-form).
const SUPERLATIVE_EMOJI: Record<SuperlativeKey, string> = {
  fastest_finger: "⚡",
  most_correct: "🎯",
  most_wrong: "🙈",
  longest_streak: "🔥",
  biggest_climber: "🧗",
  lucky_guesser: "🍀",
  comeback_kid: "🚀",
  most_achievements: "🏅",
  hardest_question: "🧠",
}

const DEFAULT_AUTO_MS = 10000

/**
 * Formats a superlative's numeric `value` for display.
 *   fastest_finger  → ms → "X.Xs"
 *   hardest_question→ correct% → "XX %"
 *   everything else → raw count.
 */
function formatValue(key: SuperlativeKey, value: number): string {
  if (key === "fastest_finger") {
    return `${(value / 1000).toFixed(1)}s`
  }
  if (key === "hardest_question") {
    return `${Math.round(value)} %`
  }
  return `${value}`
}

const RecapSequence = ({
  superlatives,
  onComplete,
  autoAdvanceMs = DEFAULT_AUTO_MS,
  autoMode = false,
}: Props) => {
  const { t } = useTranslation()
  const reveal = useReveal()

  // Step state machine: 0..n-1 are the superlative cards, `n` is the final
  // "Podium" cue. Held in one index so click + timer share a single source.
  const total = superlatives.length
  const [step, setStep] = useState(0)
  // User-controlled pause + transient pause while hovered/focused (WCAG 2.2.2).
  const [paused, setPaused] = useState(false)
  const [interacting, setInteracting] = useState(false)

  const isFinalCue = step >= total
  const autoStopped = paused || interacting

  const advance = useCallback(() => {
    setStep((s) => Math.min(s + 1, total))
  }, [total])

  // Auto-advance through the cards; the final cue holds briefly then completes.
  // Halted while paused or while the user is hovering/focusing the region;
  // manual advance via the Weiter button / click layer always still works.
  useEffect(() => {
    if (total === 0) {
      onComplete?.()
      return
    }
    // The final "Podium" cue always hands off to the podium after a short hold
    // — in manual mode the user clicks through to reach it, then this brief
    // timer flips to the podium so the sequence never dead-ends.
    if (isFinalCue) {
      const done = setTimeout(() => onComplete?.(), 1400)
      return () => clearTimeout(done)
    }
    // Per-card auto-advance is opt-in via autoMode (10s/card); otherwise the
    // user drives the cards manually (Weiter button / click layer), no timer.
    if (!autoMode) return
    if (autoStopped) return
    const timer = setTimeout(advance, autoAdvanceMs)
    return () => clearTimeout(timer)
  }, [
    step,
    total,
    isFinalCue,
    autoStopped,
    advance,
    autoMode,
    autoAdvanceMs,
    onComplete,
  ])

  if (total === 0) return null

  const current = superlatives[step]
  const awardsTitle = t("game:recap.awardsTitle", {
    defaultValue: "Auszeichnungen",
  })

  return (
    <section
      role="region"
      aria-label={awardsTitle}
      aria-live="polite"
      onMouseEnter={() => setInteracting(true)}
      onMouseLeave={() => setInteracting(false)}
      onFocus={() => setInteracting(true)}
      onBlur={() => setInteracting(false)}
      className="absolute inset-0 z-40 flex w-full flex-col items-center justify-center gap-8 px-6 text-center"
    >
      {/* Click-anywhere-to-advance — non-essential enhancement, hidden from AT
          (the Weiter button below is the accessible control). */}
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={advance}
        className="absolute inset-0 z-0 cursor-pointer focus-visible:outline-none"
      />

      {/* Title + progress */}
      <motion.h2
        className="relative z-10 text-2xl font-bold text-[color:var(--game-fg)]/90 md:text-3xl"
        variants={reveal.item()}
        initial="hidden"
        animate="visible"
        transition={reveal.spring}
      >
        {awardsTitle}
      </motion.h2>

      <AnimatePresence mode="wait">
        {!isFinalCue && current ? (
          // Medal/card surface — the superlative reads as a flat light award card
          // on the cream field, not bare floating text.
          <motion.div
            key={`card-${step}`}
            className="relative z-10 flex w-[min(90vw,28rem)] min-h-[30rem] flex-col items-center justify-center gap-5 rounded-3xl border border-[var(--border-hairline)] bg-white px-8 py-8 text-center shadow-xl md:w-[32rem] md:min-h-[34rem] md:px-12 md:py-10"
            variants={reveal.pop()}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={reveal.spring}
          >
            {/* Emoji sits in a medal disc to match the podium/achievement language. */}
            <span
              className="flex size-24 items-center justify-center rounded-full border-4 border-[var(--border-hairline)] bg-gray-100 text-6xl md:size-32 md:text-7xl lg:text-8xl"
              aria-hidden
            >
              {SUPERLATIVE_EMOJI[current.key]}
            </span>

            <p className="text-3xl font-extrabold text-[color:var(--color-field-ink)] md:text-4xl lg:text-5xl">
              {t(`game:recap.superlative.${current.key}`, {
                defaultValue: current.key.replace(/_/g, " "),
              })}
            </p>

            {/* Winner avatar above the name — flat ink text, no accent pill. */}
            <Avatar
              src={current.winnerAvatar}
              name={current.winnerName}
              size={112}
              className="mx-auto"
            />
            <p className="text-3xl font-black text-[color:var(--color-field-ink)] md:text-4xl lg:text-5xl">
              {current.winnerName}
            </p>

            <p className="rounded-full border border-[var(--border-hairline)] bg-gray-100 px-6 py-2 text-2xl font-bold text-[color:var(--color-field-ink)] tabular-nums md:text-3xl">
              {formatValue(current.key, current.value)}
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="final-cue"
            className="relative z-10 flex flex-col items-center gap-4"
            variants={reveal.pop()}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={reveal.spring}
          >
            <span className="text-7xl drop-shadow-lg md:text-8xl" aria-hidden>
              🏆
            </span>
            <p className="text-4xl font-black text-[color:var(--game-fg)] md:text-5xl">
              {t("game:recap.podiumCue", {
                defaultValue: "Und jetzt: Das Podium",
              })}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress dots — one per card, filling step-by-step as the index advances
          (a dot lights only once its card has been reached). */}
      <div className="relative z-10 flex items-center gap-2" aria-hidden>
        {superlatives.map((s, i) => (
          <span
            key={s.key}
            className={
              i <= step
                ? "h-2.5 w-2.5 rounded-full bg-white"
                : "h-2.5 w-2.5 rounded-full bg-white/30"
            }
          />
        ))}
      </div>

      {/* Accessible controls: pause/resume auto-advance + manual advance. */}
      {!isFinalCue && (
        <div className="relative z-10 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-pressed={paused}
            className="rounded-full bg-[var(--color-primary)] px-5 py-2 text-base font-bold text-white hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]"
          >
            {paused
              ? t("game:recap.resume", { defaultValue: "Fortsetzen" })
              : t("game:recap.pause", { defaultValue: "Pause" })}
          </button>
          <button
            type="button"
            onClick={advance}
            className="rounded-full bg-[var(--color-accent)] px-6 py-2 text-base font-bold text-[var(--accent-contrast-text)] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
          >
            {t("game:recap.advance", { defaultValue: "Weiter" })}
          </button>
        </div>
      )}
    </section>
  )
}

export default RecapSequence
