/**
 * RewardRow — one presentational, dismissible reward row atom.
 *
 * Used by <RewardStack> to render achievements and round bonuses in a single,
 * consistent visual language. Each row is dismissible three ways: a hover/focus
 * close button, a horizontal swipe (motion drag), and an auto-dismiss timer that
 * pauses while the row is hovered or focused.
 *
 * Titles are ALWAYS rendered white — tier text colors (e.g. silver) fail contrast
 * on the dark surface. Accent only drives the left border + leading wash.
 *
 * All non-essential motion is gated on the `reduced` flag (drag disabled,
 * entry/exit collapsed to opacity-only).
 */

import { motion } from "motion/react"
import { X } from "lucide-react"
import { useCallback, useEffect, useRef } from "react"
import type { ReactNode } from "react"

export interface RewardRowProps {
  id: string
  icon: ReactNode
  title: string
  value?: string
  badge?: string
  accent: string
  reduced: boolean
  durationMs: number
  /** Accessible label for the close button. */
  dismissLabel?: string
  onDismiss: (id: string) => void
}

const RewardRow = ({
  id,
  icon,
  title,
  value,
  badge,
  accent,
  reduced,
  durationMs,
  dismissLabel,
  onDismiss,
}: RewardRowProps) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pausedRef = useRef(false)

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const startTimer = useCallback(() => {
    clearTimer()
    // Reduced-motion: never auto-dismiss (WCAG 2.2.1) — the row persists until
    // the user dismisses it via the close button.
    if (reduced || durationMs <= 0 || pausedRef.current) return
    timerRef.current = setTimeout(() => onDismiss(id), durationMs)
    // onDismiss/id/durationMs are stable per row instance
    // oxlint-disable-next-line
  }, [reduced, durationMs, id, onDismiss])

  useEffect(() => {
    startTimer()
    return clearTimer
  }, [startTimer])

  const pause = () => {
    pausedRef.current = true
    clearTimer()
  }
  const resume = () => {
    pausedRef.current = false
    startTimer()
  }

  const handleDragEnd = (
    _e: MouseEvent | TouchEvent | PointerEvent,
    info: { offset: { x: number; y: number } },
  ) => {
    if (info.offset.x > 80) onDismiss(id)
  }

  return (
    <motion.li
      layout
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, x: 60 }}
      drag={reduced ? false : "x"}
      dragSnapToOrigin
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.4}
      onDragEnd={reduced ? undefined : handleDragEnd}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
      className="group relative flex items-center gap-3 overflow-hidden rounded-[var(--radius-theme)] bg-black/40 py-2.5 pr-3 pl-2.5 text-white shadow-lg ring-1 ring-white/10 backdrop-blur-sm pointer-events-auto"
      style={{ borderLeft: `4px solid ${accent}` }}
    >
      {/* Leading accent wash */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-16"
        style={{ background: `linear-gradient(90deg, ${accent}33, transparent)` }}
      />

      {/* Icon slot */}
      <span className="relative z-10 flex size-11 shrink-0 items-center justify-center">
        {icon}
      </span>

      {/* Title — ALWAYS white (silver fails contrast) */}
      <span className="relative z-10 min-w-0 flex-1 truncate text-sm font-extrabold leading-tight drop-shadow">
        {title}
      </span>

      {/* Optional value */}
      {value !== undefined && (
        <span className="relative z-10 shrink-0 text-base font-extrabold tabular-nums drop-shadow">
          {value}
        </span>
      )}

      {/* Optional badge */}
      {badge !== undefined && (
        <span className="relative z-10 shrink-0 text-[10px] font-bold uppercase tracking-widest text-white/80">
          {badge}
        </span>
      )}

      {/* Dismiss button — visible on hover/focus */}
      <button
        type="button"
        aria-label={dismissLabel ?? "Dismiss"}
        onClick={() => onDismiss(id)}
        className="relative z-20 shrink-0 rounded-full p-1 text-white/70 opacity-0 transition hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </motion.li>
  )
}

export default RewardRow
