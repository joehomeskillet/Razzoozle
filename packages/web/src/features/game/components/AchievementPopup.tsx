/**
 * AchievementPopup — stacked badge overlay rendered on the player result screen.
 * Each badge is revealed with a tier-specific spring animation via <AchievementMedal>.
 * Gold gets a pulse ring, Diamant gets a bounce + two-sided confetti burst.
 * localStorage persistence and tier-chime are handled by Result.tsx (caller).
 * Reduced-motion: spring/bounce collapsed to a simple fade-in.
 */

import type { MergedAchievement } from "@razzia/common/achievements"
import AchievementMedal from "@razzia/web/features/game/components/AchievementMedal"
import {
  ACHIEVEMENT_META,
  TIER_LABEL,
  TIER_TEXT,
  getAchievementDisplay,
  loadAchievementMeta,
  type AchievementMeta,
  type AchievementTier,
} from "@razzia/web/features/game/utils/achievements"
import type { TargetAndTransition, Transition } from "motion/react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

// ─── Per-tier spring animations ───────────────────────────────────────────────

const tierAnimVariants: Record<
  AchievementTier,
  {
    animate: TargetAndTransition
    transition: Transition
  }
> = {
  bronze: {
    animate: { scale: [0.7, 1.05, 1], opacity: [0, 1, 1] },
    transition: { type: "spring", duration: 0.5 },
  },
  silver: {
    animate: { scale: [0.7, 1.05, 1], opacity: [0, 1, 1] },
    transition: { type: "spring", duration: 0.55 },
  },
  gold: {
    animate: {
      scale: [0.6, 1.1, 0.95, 1],
      opacity: [0, 1, 1, 1],
    },
    transition: { type: "spring", duration: 0.65 },
  },
  diamant: {
    animate: {
      scale: [0.5, 1.2, 0.9, 1.05, 1],
      opacity: [0, 1, 1, 1, 1],
      y: [20, -8, 4, -2, 0],
    },
    transition: { type: "spring", stiffness: 300, damping: 15 },
  },
}

// ─── Diamant glow halo (behind the row card) ─────────────────────────────────

const DiamantGlow = ({ reduced }: { reduced: boolean }) => {
  if (reduced) return null
  return (
    <motion.div
      className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-cyan-400/40 via-purple-400/40 to-pink-400/40 blur-sm"
      animate={{ opacity: [0.4, 0.9, 0.4] }}
      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      aria-hidden
    />
  )
}

// ─── Single badge row ─────────────────────────────────────────────────────────

interface SingleBadgeProps {
  meta: AchievementMeta
  index: number
  reduced: boolean
  mergedList: MergedAchievement[]
}

const AchievementBadge = ({
  meta,
  index,
  reduced,
  mergedList,
}: SingleBadgeProps) => {
  const { t } = useTranslation()
  const anim = tierAnimVariants[meta.tier]

  const merged = mergedList.find((m) => m.id === meta.id)
  const display = getAchievementDisplay(meta.id, merged, {
    name: t(`${meta.i18nKey}.name`, meta.id),
    desc: t(`${meta.i18nKey}.desc`, ""),
  })

  // Card background uses a semi-transparent dark surface so the medallion gradient pops
  const isGold = meta.tier === "gold"
  const isDiamant = meta.tier === "diamant"

  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.7, y: 20 }}
      animate={reduced ? { opacity: 1 } : { ...anim.animate }}
      transition={
        reduced ? undefined : { ...anim.transition, delay: index * 0.15 }
      }
      exit={{ opacity: 0, scale: 0.8 }}
      role="status"
      aria-label={display.name}
      className="relative"
    >
      {isDiamant && <DiamantGlow reduced={reduced} />}
      {/* Row card */}
      <div className="relative flex items-center gap-3 overflow-hidden rounded-2xl bg-black/50 px-4 py-3 shadow-xl ring-1 ring-white/10 backdrop-blur-sm">
        {/* Medallion — AchievementMedal handles tier gradient, ring, emoji, gold pulse, diamant shimmer */}
        <AchievementMedal
          id={meta.id}
          tier={meta.tier}
          size="md"
          pulse={isGold || isDiamant}
        />
        {/* Text */}
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-extrabold leading-tight ${TIER_TEXT[meta.tier]}`}>
            {display.name}
          </p>
          <p className={`text-xs leading-snug opacity-85 ${TIER_TEXT[meta.tier]}`}>
            {display.description}
          </p>
        </div>
        {/* Tier label badge */}
        <span
          className={`shrink-0 text-[10px] font-bold uppercase tracking-widest opacity-70 ${TIER_TEXT[meta.tier]}`}
        >
          {TIER_LABEL[meta.tier]}
        </span>
      </div>
    </motion.div>
  )
}

// ─── Public component ─────────────────────────────────────────────────────────

interface Props {
  achievementIds: string[]
  visible: boolean
}

/**
 * Stacked achievement badge overlay. Renders on top of the Result screen.
 * Each badge slides in with a tier-specific spring animation.
 * Prefers server-provided name/description overrides when available.
 */
const AchievementPopup = ({ achievementIds, visible }: Props) => {
  const reduced = useReducedMotion() ?? false
  const [mergedList, setMergedList] = useState<MergedAchievement[]>([])

  useEffect(() => {
    loadAchievementMeta().then((list) => {
      if (list.length > 0) setMergedList(list)
    })
  }, [])

  const metas = achievementIds
    .map((id) => ACHIEVEMENT_META[id])
    .filter((m): m is AchievementMeta => m !== undefined)

  return (
    <AnimatePresence>
      {visible && metas.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="pointer-events-none absolute inset-x-0 bottom-6 z-50 mx-auto flex max-w-sm flex-col gap-2 px-4"
          aria-live="polite"
          aria-atomic="false"
        >
          {metas.map((meta, i) => (
            <AchievementBadge
              key={meta.id}
              meta={meta}
              index={i}
              reduced={reduced}
              mergedList={mergedList}
            />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default AchievementPopup
