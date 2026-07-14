/**
 * RewardRow — one presentational, dismissible reward row atom.
 *
 * Used by <RewardStack> to render achievements and round bonuses in a single,
 * consistent visual language. Each row is dismissible three ways: a hover/focus
 * close button, a horizontal swipe (motion drag), and an auto-dismiss timer that
 * pauses while the row is hovered or focused.
 *
 * Titles are rendered in field ink on the flat white card. Accent only drives the
 * left border + leading wash.
 *
 * All non-essential motion is gated on the `reduced` flag (drag disabled,
 * entry/exit collapsed to opacity-only). The entrance reveal mirrors the shared
 * `useReveal().item()` / `reveal.spring` contract from the animation presets: the
 * `reduced` flag AND the theme-tuned `spring` transition are passed down from the
 * parent <RewardStack> (which owns the single `useReveal()` call) instead of this
 * atom re-reading the hook.
 */

import { motion } from "motion/react"
import type { Transition } from "motion/react"
import { X } from "lucide-react"
import { useCallback, useEffect, useRef } from "react"
import type { ReactNode } from "react"
import {
  fadeUp,
  reducedVariants,
} from "@razzoozle/web/features/game/animation/presets"

export interface RewardRowProps {
  id: string
  icon: ReactNode
  title: string
  value?: string
  badge?: string
  accent: string
  /** Card sizing tone. "toast" matches ScoreToast (px-5 py-3 shadow-xl); default "compact". */
  tone?: "compact" | "toast"
  reduced: boolean
  /** Theme-tuned lifecycle spring (already reduced-aware) from the parent's useReveal(). */
  spring: Transition
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
  tone = "compact",
  reduced,
  spring,
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

  // Entrance reveal — mirrors reveal.item() (fade + rise, opacity-only when
  // reduced) and reveal.spring (theme-tuned lifecycle spring, or instant fade when
  // reduced), derived from the parent-supplied `reduced` flag + `spring` prop.
  const enterVariants = reduced ? reducedVariants : fadeUp(12)

  return (
    <motion.li
      layout
      variants={enterVariants}
      initial="hidden"
      animate="visible"
      transition={spring}
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
      className={`group relative flex items-center gap-3 overflow-hidden rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-white text-[color:var(--color-field-ink)] pointer-events-auto ${tone === "toast" ? "px-5 py-3 shadow-xl" : "py-2.5 pr-3 pl-2.5 shadow-md"}`}
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

      {/* Title — field ink on the flat white card */}
      <span className="relative z-10 min-w-0 flex-1 truncate text-sm font-extrabold leading-tight">
        {title}
      </span>

      {/* Optional value */}
      {value !== undefined && (
        <span className="relative z-10 shrink-0 text-base font-extrabold tabular-nums">
          {value}
        </span>
      )}

      {/* Optional badge */}
      {badge !== undefined && (
        <span className="relative z-10 shrink-0 text-[10px] font-bold uppercase tracking-widest text-[color:var(--color-field-ink)]/60">
          {badge}
        </span>
      )}

      {/* Dismiss button — visible on hover/focus */}
      <button
        type="button"
        aria-label={dismissLabel ?? "Dismiss"}
        onClick={() => onDismiss(id)}
        className="relative z-20 shrink-0 rounded-full p-1 text-[color:var(--color-field-ink)]/40 opacity-0 transition hover:bg-[var(--surface-muted)] hover:text-[color:var(--color-field-ink)] focus-visible:bg-[var(--surface-muted)] focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </motion.li>
  )
}

export default RewardRow
