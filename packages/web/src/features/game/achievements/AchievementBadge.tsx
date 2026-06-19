/**
 * AchievementBadge — pure presentational circular badge for a single
 * achievement, rendered with vendored Material Symbols SVG path data instead
 * of emoji.
 *
 * Anatomy (outer → inner): circular shell with the tier gradient + tier ring,
 * an optional one-shot gloss sweep + small sparkle, and a centered Material
 * Symbol glyph (white via `currentColor`, or `colorOverride.icon`). The glyph
 * id always resolves through `getAchievementVisual`, whose fallback guarantees a
 * non-empty badge.
 *
 * Color resolution:
 *   - Live UI → the existing tier Tailwind tokens (`TIER_GRADIENT`, `TIER_RING`,
 *     `TIER_TEXT`) — exactly how AchievementMedal applied them.
 *   - `colorOverride` given → literal inline hex via `style` (no Tailwind class /
 *     no CSS var / no oklch) so the PNG-export capture subtree stays correct.
 *
 * Motion is fully self-contained — NO `layout` prop / shared-layout spring — so
 * it is safe inside `Leaderboard`, a player-scaled list. When `animated === false`
 * OR the user prefers reduced motion, the badge renders fully static (no
 * transform / sweep / sparkle / pulsing ring).
 *
 * No socket, store, or network imports — presentation only.
 */

import {
  DURATION,
  EASE,
  useReveal,
} from "@razzoozle/web/features/game/animation/presets"
import {
  TIER_GRADIENT,
  TIER_RING,
  TIER_TEXT,
  type AchievementTier,
} from "@razzoozle/web/features/game/utils/achievements"
import { motion } from "motion/react"
import { useTranslation } from "react-i18next"
import { ICON_PATHS, ICON_VIEWBOX, type IconName } from "./iconRegistry"
import { getAchievementVisual } from "./achievementVisuals"

// ─── Size map (mirror AchievementMedal's disc / icon scale 1:1) ───────────────

const SIZE_CLASS: Record<"sm" | "md" | "lg", string> = {
  sm: "w-7 h-7", // ~28px
  md: "w-11 h-11", // ~44px
  lg: "w-16 h-16", // ~64px
}

const SVG_SIZE: Record<"sm" | "md" | "lg", string> = {
  sm: "w-3.5 h-3.5", // ~14px inner SVG
  md: "w-6 h-6", // ~24px inner SVG
  lg: "w-8 h-8", // ~32px inner SVG
}

// ─── Optional color override (literal hex for the PNG-capture subtree) ────────

export interface AchievementBadgeColorOverride {
  gradientFrom?: string
  gradientTo?: string
  ring?: string
  icon?: string
}

// ─── Animated pulsing ring (gold / diamant) ──────────────────────────────────

const PulseRing = ({ tier }: { tier: AchievementTier }) => {
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
      className="absolute -inset-0.5 rounded-full ring-2 ring-cyan-300"
      animate={{ opacity: [0.3, 0.8, 0.3] }}
      transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      aria-hidden
    />
  )
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface AchievementBadgeProps {
  /** Achievement id — resolves glyph + tier via getAchievementVisual. */
  id: string
  /** Optional tier override (callers may already know it); else resolved from id. */
  tier?: AchievementTier
  size?: "sm" | "md" | "lg"
  /** Default true. `false` = static resting badge (export-safe; no motion). */
  animated?: boolean
  /**
   * Literal hex color override for the PNG-export capture path. When provided the
   * shell/ring/icon use inline `style` hex instead of Tailwind tier classes — no
   * CSS var / no oklch in the capture subtree.
   */
  colorOverride?: AchievementBadgeColorOverride
  /** Optional text label rendered beneath the disc. */
  label?: string
  /** Force the pulsing ring regardless of tier (only honoured when animated). */
  pulse?: boolean
  className?: string
}

// ─── Component ───────────────────────────────────────────────────────────────

const AchievementBadge = ({
  id,
  tier: tierProp,
  size = "md",
  animated = true,
  colorOverride,
  label,
  pulse = false,
  className = "",
}: AchievementBadgeProps) => {
  const reveal = useReveal()
  const { t } = useTranslation()

  const visual = getAchievementVisual(id)
  const glyph: IconName = visual.glyph
  const tier: AchievementTier = tierProp ?? visual.tier
  const path = ICON_PATHS[glyph]

  const displayName = `${t(`game:tier.${tier}`)} — ${id.replace(/_/g, " ")}`

  // Motion only when explicitly animated AND the user has not opted out.
  const motionOn = animated && !reveal.reduced
  const usingOverride = colorOverride !== undefined

  const showPulseRing = motionOn && (pulse || tier === "gold" || tier === "diamant")

  // Inline literal-hex styles for the capture path (no Tailwind/CSS var/oklch).
  const discStyle = usingOverride
    ? {
        backgroundImage:
          colorOverride?.gradientFrom || colorOverride?.gradientTo
            ? `linear-gradient(to bottom right, ${
                colorOverride.gradientFrom ?? colorOverride.gradientTo
              }, ${colorOverride.gradientTo ?? colorOverride.gradientFrom})`
            : undefined,
        boxShadow: colorOverride?.ring
          ? `0 0 0 2px ${colorOverride.ring}`
          : undefined,
      }
    : undefined
  const iconStyle = usingOverride
    ? { color: colorOverride?.icon ?? "#ffffff" }
    : undefined

  // Tier Tailwind classes only when NOT overriding (override drives inline hex).
  const discTierClasses = usingOverride
    ? ""
    : `bg-gradient-to-br ring-2 ${TIER_GRADIENT[tier]} ${TIER_RING[tier]}`
  const iconTierClasses = usingOverride ? "" : TIER_TEXT[tier]

  // The disc element: animated pop when motionOn, otherwise a plain static span.
  const discInner = (
    <>
      {/* Pulsing ring — only when motion is on (gated above). */}
      {showPulseRing && <PulseRing tier={tier} />}

      {/* One-shot gloss sweep — only when motion is on. */}
      {motionOn && (
        <motion.span
          className="pointer-events-none absolute inset-y-0 -left-full z-20 w-1/2 skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/70 to-transparent"
          initial={{ x: 0 }}
          animate={{ x: "300%" }}
          transition={{
            duration: DURATION.sheen,
            ease: EASE.out,
            delay: DURATION.fast,
          }}
          aria-hidden
        />
      )}

      {/* Small sparkle — only when motion is on. */}
      {motionOn && (
        <motion.span
          className="pointer-events-none absolute right-[14%] top-[14%] z-20 block h-1 w-1 rounded-full bg-white"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.4, 0], opacity: [0, 1, 0] }}
          transition={{
            duration: DURATION.slow,
            ease: EASE.out,
            delay: DURATION.base,
          }}
          aria-hidden
        />
      )}

      {/* Centered Material Symbol glyph. Always rendered (fallback guarantees it). */}
      <svg
        viewBox={ICON_VIEWBOX}
        className={`relative z-10 select-none leading-none ${SVG_SIZE[size]} ${iconTierClasses}`}
        style={iconStyle}
        aria-hidden
      >
        <path d={path} fill="currentColor" />
      </svg>
    </>
  )

  const discClassName = `relative inline-flex items-center justify-center overflow-hidden rounded-full ${SIZE_CLASS[size]} ${discTierClasses}`

  return (
    <span className={`inline-flex flex-col items-center gap-1 ${className}`}>
      {motionOn ? (
        <motion.span
          role="img"
          aria-label={displayName}
          className={discClassName}
          style={discStyle}
          variants={reveal.pop()}
          initial="hidden"
          animate="visible"
          transition={reveal.spring}
        >
          {discInner}
        </motion.span>
      ) : (
        <span
          role="img"
          aria-label={displayName}
          className={discClassName}
          style={discStyle}
        >
          {discInner}
        </span>
      )}

      {/* Optional label — inherits text color from parent; tabular-nums for counts. */}
      {label !== undefined && (
        <span className="tabular-nums text-[10px] font-semibold leading-none tracking-wide opacity-80">
          {label}
        </span>
      )}
    </span>
  )
}

export default AchievementBadge
