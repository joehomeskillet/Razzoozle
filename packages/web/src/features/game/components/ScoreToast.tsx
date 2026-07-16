/**
 * ScoreToast — a Steam/Valve "achievement unlocked"-style result toast for solo
 * play. Slides in at the top-center of the viewport and reveals the points for
 * the answer as a count-up.
 *
 * Flat-light card surface matching the cream field: white background, soft
 * shadow + hairline border, accent-driven left border + leading wash, ink text.
 * Full-motion (slide down + spring settle + one-shot sheen sweep) collapses to
 * an opacity-only fade under reduced motion. The count-up reuses AnimatedPoints,
 * which already self-handles reduced motion.
 *
 * Rendered through a portal to document.body so the `position: fixed` toast
 * attaches to the viewport (not to SoloShell's transformed, overflow-hidden
 * animated content wrapper, which would otherwise become the containing block
 * and clip the slide-in / re-scope z-[60]).
 */
import AnimatedPoints from "@razzoozle/web/features/game/components/AnimatedPoints"
import {
  accentWash,
  rewardCardClass,
} from "@razzoozle/web/features/game/components/RewardRow"
import { useReveal } from "@razzoozle/web/features/game/animation/presets"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Trophy, X } from "lucide-react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"

interface Props {
  correct: boolean
  /** Server points for this answer. */
  points: number
  /** = resultReady (phase === "result" && lastResult !== null). */
  visible: boolean
}

const ScoreToast = ({ correct, points, visible }: Props) => {
  const { t } = useTranslation()
  const reduced = useReducedMotion() ?? false
  const reveal = useReveal()

  const accent = correct ? "var(--color-accent)" : "var(--state-wrong)"

  if (typeof document === "undefined") return null

  return createPortal(
    <AnimatePresence>
      {visible && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: -64, scale: 0.9 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: -32 }}
          transition={reveal.spring}
          className="pointer-events-none fixed left-1/2 z-[60] -translate-x-1/2"
          style={{ top: "max(1.5rem, env(safe-area-inset-top))" }}
        >
          {/* Single static announcement for the live region: read once with the
              final value. The ticking count-up below is aria-hidden so screen
              readers do not announce every intermediate spring frame. */}
          <span className="sr-only">
            {correct ? `${t("game:correct")} +${points}` : t("game:wrong")}
          </span>

          <div
            className={rewardCardClass("toast")}
            style={{ borderLeft: `4px solid ${accent}` }}
          >
            {/* Leading accent wash */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 w-16"
              style={{ background: accentWash(accent) }}
            />

            {/* One-shot sheen sweep — correct only, full-motion only */}
            {correct && !reduced && (
              <motion.span
                aria-hidden
                initial={{ x: "-150%" }}
                animate={{ x: "150%" }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/30 to-transparent"
              />
            )}

            {/* Icon circle */}
            <span
              className="relative z-10 flex size-11 shrink-0 items-center justify-center rounded-full"
              style={{ background: `color-mix(in srgb, ${accent} 13%, transparent)` }}
            >
              {correct ? (
                <motion.span
                  initial={reduced ? false : { scale: 0.6 }}
                  animate={reduced ? {} : { scale: [0.6, 1.15, 1] }}
                  transition={reduced ? undefined : { duration: 0.5 }}
                  className="flex items-center justify-center"
                  style={{ color: accent }}
                >
                  <Trophy className="size-6" aria-hidden="true" />
                </motion.span>
              ) : (
                <span
                  className="flex items-center justify-center"
                  style={{ color: accent }}
                >
                  <X className="size-6" aria-hidden="true" />
                </span>
              )}
            </span>

            {/* Text column */}
            <span className="relative z-10 flex min-w-0 flex-col">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--color-field-ink)]/60">
                {correct ? t("game:correct") : t("game:wrong")}
              </span>
              {correct && (
                <span
                  aria-hidden
                  className="text-3xl font-black tabular-nums text-[var(--color-accent)]"
                >
                  +<AnimatedPoints to={points} className="tabular-nums" />
                </span>
              )}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

export default ScoreToast
