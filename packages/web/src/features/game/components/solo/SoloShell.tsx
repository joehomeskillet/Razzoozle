import React from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

// ---------------------------------------------------------------------------
// Minimal solo shell — replaces GameWrapper to avoid socket coupling
// ---------------------------------------------------------------------------

/**
 * Interface-Aenderung betrifft BEIDE Routen (solo + assignment); die
 * Divergenzen Badge (Solo/Aufgabe) + Score-Pill-Klasse sind absichtlich und
 * duerfen nicht normalisiert werden.
 */
interface SoloShellProps {
  children: React.ReactNode
  questionCurrent?: number
  questionTotal?: number
  playerName: string
  totalPoints: number
  /**
   * Key for the AnimatePresence transition around the content slot. Keyed on
   * the question index (NOT the phase) so SoloAnswers stays mounted across the
   * answering→result transition — remounting it would restart its countdown
   * and answer-music lifecycle.
   */
  phaseKey: number
  // Optional action rendered in the bottom bar next to the score — e.g. the
  // result-phase "next question" button, so it is always reachable without
  // scrolling and never crowds the answer content.
  footerAction?: React.ReactNode
  variant: "solo" | "assignment"
}

const SoloShell = ({
  children,
  questionCurrent,
  questionTotal,
  playerName,
  totalPoints,
  phaseKey,
  footerAction,
  variant,
}: SoloShellProps) => {
  const reduced = useReducedMotion() ?? false

  return (
    <section
      className="relative flex h-dvh overflow-hidden"
      style={{ "--game-fg": "#0E1120" } as React.CSSProperties}
    >
      <div className="z-10 flex w-full flex-1 flex-col justify-between">
        {/* Top bar: question counter */}
        <div className="flex w-full items-center justify-between gap-2 p-4">
          <div className="flex shrink-0 justify-start">
            {questionCurrent != null && questionTotal != null && (
              <motion.div
                key={questionCurrent}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="flex min-h-11 items-center rounded-lg border border-[var(--border-hairline)] bg-white px-4 text-lg font-bold text-[color:var(--color-field-ink)] shadow-sm"
              >
                {`${questionCurrent} / ${questionTotal}`}
              </motion.div>
            )}
          </div>
          <div className="shrink-0 rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-[color:var(--color-field-ink)]/70">
            {variant === "solo" ? "Solo" : "Aufgabe"}
          </div>
        </div>

        {/* Content */}
        <div className="flex min-h-0 flex-1 flex-col justify-center overflow-hidden px-4 pt-2 pb-3">
          <AnimatePresence mode="wait">
            <motion.div
              key={phaseKey}
              className="flex min-h-0 flex-1 flex-col justify-center overflow-hidden"
              initial={
                reduced ? { opacity: 0 } : { opacity: 0, y: 20 }
              }
              animate={
                reduced ? { opacity: 1 } : { opacity: 1, y: 0 }
              }
              exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Bottom bar: player name + (optional next action) + points */}
        <div className="z-50 flex items-center justify-between gap-3 border-t border-[var(--border-hairline)] bg-white px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-lg font-bold text-[color:var(--color-field-ink)]">
          <p className="min-w-0 truncate text-gray-800">{playerName}</p>
          <div className="flex shrink-0 items-center gap-3">
            {footerAction}
            <div
              className={
                variant === "solo"
                  ? "rounded-lg bg-gray-800 px-3 py-1 text-lg tabular-nums text-white"
                  : "rounded-lg bg-white border border-[var(--border-hairline)] px-3 py-1 text-lg tabular-nums text-[var(--game-fg)] shadow-[var(--shadow-flat)]"
              }
            >
              {totalPoints}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default SoloShell
