/**
 * AchievementMedal — pure presentational circular medallion for a single
 * achievement badge. Renders a tier-gradient disc with the badge emoji centered,
 * an optional label underneath, and a subtle animated ring/shimmer for gold and
 * diamant tiers (gated on useReducedMotion).
 *
 * No socket, store, or network imports — presentation only.
 */

import {
  ACHIEVEMENT_META,
  TIER_GRADIENT,
  TIER_LABEL,
  TIER_RING,
  type AchievementTier,
} from "@razzoozle/web/features/game/utils/achievements"
import { motion, useReducedMotion } from "motion/react"

// ─── Size map ────────────────────────────────────────────────────────────────

const SIZE_CLASS: Record<"sm" | "md" | "lg", string> = {
  sm: "w-7 h-7",   // ~28px
  md: "w-11 h-11", // ~44px
  lg: "w-16 h-16", // ~64px
}

const EMOJI_SIZE: Record<"sm" | "md" | "lg", string> = {
  sm: "text-base",   // ~16px
  md: "text-2xl",    // ~24px
  lg: "text-[2rem]", // ~32px
}

// ─── Animated ring (gold / diamant) ──────────────────────────────────────────

interface PulseRingProps {
  tier: AchievementTier
}

const PulseRing = ({ tier }: PulseRingProps) => {
  if (tier === "gold") {
    return (
      <motion.span
        className="absolute inset-0 rounded-full ring-4 ring-yellow-300/60"
        animate={{ opacity: [0.4, 0.9, 0.4], scale: [1, 1.08, 1] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      />
    )
  }
  // diamant
  return (
    <motion.span
      className="absolute -inset-0.5 rounded-full bg-gradient-to-r from-cyan-400/50 via-fuchsia-500/50 to-violet-500/50 blur-sm"
      animate={{ opacity: [0.3, 0.8, 0.3] }}
      transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      aria-hidden
    />
  )
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface AchievementMedalProps {
  /** Achievement id — used to look up emoji icon from ACHIEVEMENT_META. */
  id: string
  tier: AchievementTier
  size?: "sm" | "md" | "lg"
  /** Optional text label rendered beneath the disc. */
  label?: string
  /** Force the animated ring regardless of tier (pass true for explicit pulse). */
  pulse?: boolean
  className?: string
}

// ─── Component ───────────────────────────────────────────────────────────────

const AchievementMedal = ({
  id,
  tier,
  size = "md",
  label,
  pulse = false,
  className = "",
}: AchievementMedalProps) => {
  const reduced = useReducedMotion() ?? false

  const meta = ACHIEVEMENT_META[id]
  const icon = meta?.icon ?? "🏅"
  const displayName = meta
    ? `${TIER_LABEL[tier]} — ${id.replace(/_/g, " ")}`
    : id.replace(/_/g, " ")

  const showAnimatedRing =
    !reduced && (pulse || tier === "gold" || tier === "diamant")

  return (
    <span
      className={`inline-flex flex-col items-center gap-1 ${className}`}
    >
      {/* Disc */}
      <span
        role="img"
        aria-label={displayName}
        className={`relative inline-flex items-center justify-center rounded-full bg-gradient-to-br ring-2 ${SIZE_CLASS[size]} ${TIER_GRADIENT[tier]} ${TIER_RING[tier]}`}
      >
        {/* Animated ring — reduced-motion: static only */}
        {showAnimatedRing && <PulseRing tier={tier} />}

        {/* Emoji icon */}
        <span
          className={`relative z-10 select-none leading-none ${EMOJI_SIZE[size]}`}
          aria-hidden
        >
          {icon}
        </span>
      </span>

      {/* Optional label — inherits text color from parent; tabular-nums for counts */}
      {label !== undefined && (
        <span className="tabular-nums text-[10px] font-semibold leading-none tracking-wide opacity-80">
          {label}
        </span>
      )}
    </span>
  )
}

export default AchievementMedal
