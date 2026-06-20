/**
 * AchievementBurst — an animated, centered cluster of newly-unlocked
 * achievements that overlays the post-game podium.
 *
 * Each freshly-earned badge pops in (staggered, overshoot) as a compact
 * tier-gradient emoji disc; reduced motion degrades to a static opacity-only
 * reveal. The container is `pointer-events-none` so it never blocks the
 * podium / share buttons beneath.
 *
 * Presentation only — no socket, store, or network imports. Cream visual
 * language is applied purely through the shared tier tokens + Tailwind classes.
 */

import { useReveal } from "@razzoozle/web/features/game/animation/presets"
import {
  ACHIEVEMENT_META,
  TIER_GRADIENT,
  TIER_RING,
} from "@razzoozle/web/features/game/utils/achievements"
import type { AchievementMeta } from "@razzoozle/web/features/game/utils/achievements"
import clsx from "clsx"
import { motion } from "motion/react"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"

import type { AchievementBurstProps } from "./types"

import { ICON_PATHS, ICON_VIEWBOX } from '@razzoozle/web/features/game/achievements/iconRegistry'
import { getAchievementVisual } from '@razzoozle/web/features/game/achievements/achievementVisuals'

/** Cap visible badges so the queue stays bounded. */
const MAX_BADGES = 8

interface ResolvedBadge {
  id: string
  meta: AchievementMeta
}

const AchievementBurst = ({
  ids,
  active = true,
  onComplete,
}: AchievementBurstProps) => {
  const reveal = useReveal()
  const { t } = useTranslation()

  // Resolve ids → meta, dropping unknown ids (noUncheckedIndexedAccess), cap at 8.
  const badges: ResolvedBadge[] = ids
    .map((id): ResolvedBadge | null => {
      const meta = ACHIEVEMENT_META[id]
      return meta ? { id, meta } : null
    })
    .filter((b): b is ResolvedBadge => b !== null)
    .slice(0, MAX_BADGES)

  const count = badges.length

  // Fire onComplete once, after the badges have had time to play in.
  useEffect(() => {
    if (count === 0 || !active || !onComplete) return
    const timer = window.setTimeout(onComplete, 1600)
    return () => window.clearTimeout(timer)
  }, [count, active, onComplete])

  if (count === 0) return null

  return (
    <motion.div
      className="pointer-events-none flex max-w-md flex-wrap items-center justify-center gap-2"
      variants={reveal.container()}
      initial="hidden"
      animate={active ? "visible" : "hidden"}
    >
      {badges.map(({ id, meta }) => {
        const tier = meta.tier
        const label = t(`${meta.i18nKey}.name`, { defaultValue: id })
        const visual = getAchievementVisual(id)
        const glyphPath = ICON_PATHS[visual.glyph]
        return (
          <motion.div
            key={id}
            title={label}
            aria-label={label}
            variants={reveal.pop()}
            transition={reveal.snap}
            className={clsx(
              "flex size-12 items-center justify-center rounded-full bg-gradient-to-br",
              "shadow-lg ring-2",
              TIER_GRADIENT[tier],
              TIER_RING[tier],
            )}
          >
            <svg
              viewBox={ICON_VIEWBOX}
              className="w-6 h-6 select-none leading-none"
              style={{ color: '#ffffff' }}
              aria-hidden
            >
              <path d={glyphPath} fill="currentColor" />
            </svg>
          </motion.div>
        )
      })}
    </motion.div>
  )
}

export default AchievementBurst
