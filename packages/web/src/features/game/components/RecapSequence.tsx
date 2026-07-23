/**
 * RecapSequence — manager big-screen card-by-card reveal. Used in TWO places
 * with the SAME machinery (one component, two data sources):
 *   1. End-of-game: the awarded `superlatives`, played BEFORE the podium.
 *   2. Per-round: the round's `roundAwards` (fastest finger, streak, …) on their
 *      OWN full-screen page between the answer reveal and the leaderboard.
 * Walks the cards one at a time (click to advance + an auto-advance timer), each
 * card showing a playful German label + emoji for the key, the winner name, and
 * the formatted value. Ends on a "Podium" cue and calls `onComplete` so the
 * parent can flip to the next screen.
 *
 * A11y: the card content lives in a non-interactive `role="region"`
 * (aria-live="polite") so screen readers announce the award label, winner, and
 * value. Advancing is driven by a real, focusable "Weiter" button; the
 * click-anywhere layer is a non-essential, aria-hidden enhancement on top. The
 * auto-advance timer can be paused/resumed via the explicit Pause button (WCAG 2.2.2).
 *
 * Reduced-motion safe via `useReveal` (opacity-only fallback, no fabricated
 * motion). Pure presentation: no socket / store writes — labels come from i18n
 * (`game:recap.superlative.<key>` / `game:roundRecap.<key>`) with the emoji
 * mapped locally.
 */

import type {
  RoundRecapAward,
  Superlative,
  SuperlativeKey,
} from "@razzoozle/common/types/game"
import Avatar from "@razzoozle/web/components/Avatar"
import Button from "@razzoozle/web/components/Button"
import {
  DURATION,
  EASE,
  useReveal,
} from "@razzoozle/web/features/game/animation/presets"
import {
  ROUND_RECAP_EMOJI,
  formatRoundRecapValue,
  roundRecapLabelKey,
} from "@razzoozle/web/features/game/recap/formatRoundRecap"
import {
  ICON_PATHS,
  ICON_VIEWBOX,
  type IconName,
} from "@razzoozle/web/features/game/achievements/iconRegistry"
import {
  ROUND_RECAP_GLYPH,
  SUPERLATIVE_GLYPH,
  RECAP_FINAL_GLYPH,
} from "@razzoozle/web/features/game/recap/recapVisuals"
import { AnimatePresence, motion } from "motion/react"
import type { Transition } from "motion/react"
import clsx from "clsx"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

interface Props {
  /** End-of-game superlatives. Provide this OR `roundAwards`. */
  superlatives?: Superlative[]
  /** Per-round recap awards — same cards, sourced from the per-round contract. */
  roundAwards?: RoundRecapAward[]
  /** Fired once the final "Podium" cue has been shown (or the sequence skipped). */
  onComplete?: () => void
  /** ms each card stays before auto-advancing. */
  autoAdvanceMs?: number
  /** Opt OUT of auto-advance (defaults to true → cards advance on their own). */
  autoMode?: boolean
}

// Playful emoji per superlative key — labels themselves live in i18n (du-form).
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

// Sensible per-card hold; cards auto-advance by default at this cadence.
const DEFAULT_AUTO_MS = 4000

/**
 * Formats a superlative's numeric `value` for display.
 *   fastest_finger  → ms → "X.Xs"
 *   hardest_question→ correct% → "XX %"
 *   everything else → raw count.
 */
function formatSuperlativeValue(key: SuperlativeKey, value: number): string {
  if (key === "fastest_finger") {
    return `${(value / 1000).toFixed(1)}s`
  }
  if (key === "hardest_question") {
    return `${Math.round(value)} %`
  }
  return `${value}`
}

// Normalized card shape so the render path is agnostic to the data source.
interface RecapCard {
  key: string
  emoji: string
  /** Material-Symbol glyph rendered in the medal disc. */
  glyph: IconName
  /** i18n key for the label. */
  label: string
  /** Fallback shown if the i18n key is missing. */
  labelFallback: string
  winnerName: string
  winnerAvatar?: string
  /** Already-formatted value string ("" when the key carries no value). */
  value: string
}

// 4-point twinkle star used for the award sparkle effect.
const SPARKLE_PATH =
  "M12 0C12.6 7 17 11.4 24 12C17 12.6 12.6 17 12 24C11.4 17 7 12.6 0 12C7 11.4 11.4 7 12 0Z"
// Sparkle positions around the glyph disc + staggered delays so they twinkle out of sync.
const SPARKLES = [
  { top: "-10%", left: "8%", delay: 0, size: "size-3 md:size-4" },
  { top: "6%", left: "86%", delay: 0.6, size: "size-2.5 md:size-3.5" },
  { top: "82%", left: "-8%", delay: 1.0, size: "size-2.5 md:size-3.5" },
  { top: "88%", left: "82%", delay: 1.4, size: "size-3 md:size-4" },
  { top: "38%", left: "-16%", delay: 0.3, size: "size-2 md:size-3" },
  { top: "44%", left: "102%", delay: 0.9, size: "size-2 md:size-3" },
]

const RecapSequence = ({
  superlatives,
  roundAwards,
  onComplete,
  autoAdvanceMs = DEFAULT_AUTO_MS,
  autoMode = true,
}: Props) => {
  const { t } = useTranslation()
  const reveal = useReveal()

  // Build the normalized card list once per render from whichever source was
  // given. roundAwards wins when present; otherwise superlatives.
  const cards: RecapCard[] =
    roundAwards !== undefined
      ? roundAwards.slice(0, 3).map((a) => ({
          key: a.key,
          emoji: ROUND_RECAP_EMOJI[a.key],
          glyph: ROUND_RECAP_GLYPH[a.key],
          label: roundRecapLabelKey(a.key),
          labelFallback: a.key.replace(/_/g, " "),
          winnerName: a.winnerName,
          winnerAvatar: a.winnerAvatar,
          value: formatRoundRecapValue(a.key, a.value),
        }))
      : (superlatives ?? []).map((s) => ({
          key: s.key,
          emoji: SUPERLATIVE_EMOJI[s.key],
          glyph: SUPERLATIVE_GLYPH[s.key],
          label: `game:recap.superlative.${s.key}`,
          labelFallback: s.key.replace(/_/g, " "),
          winnerName: s.winnerName,
          winnerAvatar: s.winnerAvatar,
          value: formatSuperlativeValue(s.key, s.value),
        }))

  // Step state machine: 0..n-1 are the cards, `n` is the final "Podium" cue.
  // Held in one index so click + timer share a single source.
  const total = cards.length
  const [step, setStep] = useState(0)
  // User-controlled pause via the explicit Pause button (WCAG 2.2.2).
  const [paused, setPaused] = useState(false)

  const isFinalCue = step >= total
  const autoStopped = paused

  const advance = useCallback(() => {
    setStep((s) => Math.min(s + 1, total))
  }, [total])

  // `onComplete` can be triggered from two independent paths once the final
  // cue is reached (the auto-hold timer below, and the final-cue "Weiter"
  // button rendered further down) — guard so a click that lands right as the
  // timer fires can't hand off to the parent twice.
  const completedRef = useRef(false)
  const fireComplete = useCallback(() => {
    if (completedRef.current) return
    completedRef.current = true
    onComplete?.()
  }, [onComplete])

  // Auto-advance through the cards; the final cue holds briefly then completes.
  // Halted while paused; manual advance via the Weiter button / click layer always still works.
  useEffect(() => {
    if (total === 0) {
      fireComplete()
      return
    }
    // The final "Podium" cue always hands off after a short hold — in manual
    // mode the user clicks through to reach it, then this brief timer fires
    // onComplete so the sequence never dead-ends. A visible "Weiter" button
    // (below) lets the host skip the hold instead of waiting it out.
    if (isFinalCue) {
      const done = setTimeout(fireComplete, 1400)
      return () => clearTimeout(done)
    }
    // Per-card auto-advance runs by default (autoMode defaults to true) at
    // autoAdvanceMs/card; pass autoMode={false} to drive the cards manually
    // (Weiter button / click layer) with no timer.
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
    fireComplete,
  ])

  if (total === 0) return null

  const current = cards[step]
  const awardsTitle = t("game:recap.awardsTitle", {
    defaultValue: "Auszeichnungen",
  })

  // 3D card-flip transition between recap cards. Each step change re-keys the
  // card node, so AnimatePresence mode="wait" plays the OLD card's `exit`
  // (rotate away + fade) fully, then mounts the NEW card with `initial`→`animate`
  // (rotate in). The content therefore swaps at the midpoint of the flip while
  // the card edge is turned toward the viewer. Reduced motion: no rotateY at all
  // — just an opacity crossfade (instant content swap, no fabricated spin).
  const flipTransition: Transition = reveal.reduced
    ? { duration: DURATION.instant }
    : { duration: 0.5, ease: EASE.inOut }
  const flip = reveal.reduced
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      }
    : {
        initial: { opacity: 0, rotateY: 90 },
        animate: { opacity: 1, rotateY: 0 },
        exit: { opacity: 0, rotateY: -90 },
      }

  return (
    <section
      data-testid="recap-sequence"
      role="region"
      aria-label={awardsTitle}
      aria-live="polite"
      className="absolute inset-0 z-40 flex w-full flex-col items-center justify-center gap-6 px-6 text-center"
    >
      {/* Click-anywhere-to-advance — non-essential enhancement, hidden from AT
          (the Weiter button below is the accessible control). */}
      <button
        type="button"
        data-testid="recap-advance"
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

      {/* Perspective container — gives the flipping card depth so the rotateY
          reads as a real 3D turn rather than a flat squash. */}
      <div
        className="relative z-10 flex w-full items-center justify-center"
        style={{ perspective: 1200 }}
      >
        <AnimatePresence mode="wait">
          {!isFinalCue && current ? (
            // Medal/card surface — the award reads as a flat light award card
            // on the cream field, not bare floating text.
            <motion.div
              key={`card-${step}`}
              className="relative flex w-[min(94vw,56rem)] flex-col items-stretch justify-between gap-6 rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-white px-8 py-6 text-center shadow-[var(--shadow-flat)] md:flex-row md:gap-8 md:px-12 md:py-8"
              style={{ transformStyle: "preserve-3d", backfaceVisibility: "hidden" }}
              initial={flip.initial}
              animate={flip.animate}
              exit={flip.exit}
              transition={flipTransition}
            >
              {/* Award side — glyph gently pulses with twinkling sparkles (subtle, reduced-motion safe) */}
              <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
                <span
                  className="relative flex size-24 items-center justify-center rounded-full border-4 border-[var(--border-hairline)] bg-white md:size-32"
                  aria-hidden
                >
                  {!reveal.reduced &&
                    SPARKLES.map((s, i) => (
                      <motion.svg
                        key={i}
                        viewBox="0 0 24 24"
                        aria-hidden
                        className={clsx(
                          "absolute text-[color:var(--color-accent)] drop-shadow",
                          s.size,
                        )}
                        style={{ top: s.top, left: s.left }}
                        initial={{ scale: 0, opacity: 0, rotate: 0 }}
                        animate={{ scale: [0, 1, 0], opacity: [0, 1, 0], rotate: [0, 80] }}
                        transition={{
                          duration: 1.6,
                          repeat: Infinity,
                          repeatDelay: 0.6,
                          delay: s.delay,
                          ease: "easeInOut",
                        }}
                      >
                        <path d={SPARKLE_PATH} fill="currentColor" />
                      </motion.svg>
                    ))}
                  <motion.svg
                    viewBox={ICON_VIEWBOX}
                    className="relative size-14 text-[color:var(--color-primary)] md:size-20"
                    aria-hidden
                    animate={reveal.reduced ? undefined : { scale: [1, 1.08, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <path d={ICON_PATHS[current.glyph]} fill="currentColor" />
                  </motion.svg>
                </span>
                <p className="text-2xl font-extrabold text-[color:var(--color-field-ink)] md:text-3xl lg:text-4xl">
                  {t(current.label, { defaultValue: current.labelFallback })}
                </p>
              </div>

              {/* Vertical divider — subtle separator with breathing room */}
              <div
                aria-hidden
                className="h-px w-full bg-[var(--border-hairline)] md:h-2/3 md:w-px md:shrink-0 md:self-center"
              />

              {/* Winner side — avatar + name + value, centered to mirror the award side */}
              <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center md:gap-5">
                <Avatar
                  src={current.winnerAvatar}
                  name={current.winnerName}
                  size={128}
                  className="mx-auto"
                />
                <p className="text-2xl font-black text-[color:var(--color-field-ink)] md:text-3xl lg:text-4xl">
                  {current.winnerName}
                </p>
                {current.value ? (
                  <p className="rounded-full border border-[var(--border-hairline)] bg-white px-5 py-2 text-lg font-bold text-[color:var(--color-field-ink)] tabular-nums md:text-xl">
                    {current.value}
                  </p>
                ) : null}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="final-cue"
              className="relative flex flex-col items-center gap-3"
              style={{ transformStyle: "preserve-3d", backfaceVisibility: "hidden" }}
              initial={flip.initial}
              animate={flip.animate}
              exit={flip.exit}
              transition={flipTransition}
            >
              <svg
                viewBox={ICON_VIEWBOX}
                className="size-24 text-[color:var(--color-primary)] drop-shadow-lg md:size-28"
                aria-hidden
              >
                <path d={ICON_PATHS[RECAP_FINAL_GLYPH]} fill="currentColor" />
              </svg>
              <p className="text-3xl font-black text-[color:var(--game-fg)] md:text-4xl">
                {t("game:recap.podiumCue", {
                  defaultValue: "Und jetzt: Das Podium",
                })}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Controls: progress dots + buttons (per-card), or the final-cue advance */}
      {!isFinalCue ? (
        <div className="relative z-10 flex flex-col items-center gap-4 md:gap-5">
          {/* Progress dots — one per card, filling step-by-step as the index advances
              (a dot lights only once its card has been reached). */}
          <div className="flex items-center gap-2" aria-hidden>
            {cards.map((c, i) => (
              <span
                key={`${c.key}-${i}`}
                className={
                  i <= step
                    ? "h-2.5 w-2.5 rounded-full bg-white"
                    : "h-2.5 w-2.5 rounded-full bg-white/40"
                }
              />
            ))}
          </div>

          {/* Pause/Resume + Weiter buttons via shared Button component */}
          <div className="flex items-center gap-2 md:gap-3">
            <Button
              variant="secondary"
              size="md"
              onClick={() => setPaused((p) => !p)}
              aria-pressed={paused}
            >
              {paused
                ? t("game:recap.resume")
                : t("game:recap.pause")}
            </Button>
            <Button
              variant="primary"
              size="md"
              data-testid="recap-advance"
              onClick={advance}
            >
              {t("game:recap.advance")}
            </Button>
          </div>
        </div>
      ) : (
        // Final-cue advance: fires the same `fireComplete` the 1400ms auto-hold
        // timer uses, so the host isn't stuck waiting on it — a real click can
        // hand off immediately. Guarded above, so this can't double-fire even
        // if it lands right as the timer resolves.
        <div className="relative z-10 flex items-center">
          <Button
            variant="primary"
            size="md"
            data-testid="recap-final-advance"
            onClick={fireComplete}
          >
            {t("game:recap.advance")}
          </Button>
        </div>
      )}
    </section>
  )
}

export default RecapSequence
