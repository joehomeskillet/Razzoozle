import {
  ACHIEVEMENT_META,
  TIER_STYLES,
  type AchievementMeta,
  type AchievementTier,
} from "@razzia/web/features/game/utils/achievements"
import type { TargetAndTransition, Transition } from "motion/react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useTranslation } from "react-i18next"

interface SingleBadgeProps {
  meta: AchievementMeta
  index: number
  reduced: boolean
}

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

const GoldPulse = ({ reduced }: { reduced: boolean }) => {
  if (reduced) return null
  return (
    <motion.div
      className="absolute inset-0 rounded-2xl bg-yellow-300/30"
      animate={{ opacity: [0.3, 0.7, 0.3], scale: [1, 1.05, 1] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
      aria-hidden
    />
  )
}

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

const AchievementBadge = ({ meta, index, reduced }: SingleBadgeProps) => {
  const { t } = useTranslation()
  const style = TIER_STYLES[meta.tier]
  const anim = tierAnimVariants[meta.tier]

  return (
    <motion.div
      initial={
        reduced ? { opacity: 0 } : { opacity: 0, scale: 0.7, y: 20 }
      }
      animate={
        reduced ? { opacity: 1 } : { ...anim.animate }
      }
      transition={
        reduced
          ? undefined
          : { ...anim.transition, delay: index * 0.15 }
      }
      exit={{ opacity: 0, scale: 0.8 }}
      role="status"
      aria-label={t(meta.i18nKey + ".name", meta.id)}
      className="relative"
    >
      {meta.tier === "diamant" && <DiamantGlow reduced={reduced} />}
      <div
        className={`relative flex items-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-r ring-2 px-4 py-3 shadow-xl ${style.gradient} ${style.ringColor}`}
      >
        {meta.tier === "gold" && <GoldPulse reduced={reduced} />}
        <span className="relative z-10 text-2xl leading-none" aria-hidden>
          {meta.icon}
        </span>
        <div className="relative z-10">
          <p className={`text-sm font-extrabold leading-tight ${style.textColor}`}>
            {t(`${meta.i18nKey}.name`, meta.id)}
          </p>
          <p
            className={`text-xs leading-snug opacity-85 ${style.textColor}`}
          >
            {t(`${meta.i18nKey}.desc`, "")}
          </p>
        </div>
        <span
          className={`relative z-10 ml-auto text-[10px] font-bold uppercase tracking-widest opacity-70 ${style.textColor}`}
        >
          {style.label}
        </span>
      </div>
    </motion.div>
  )
}

interface Props {
  achievementIds: string[]
  visible: boolean
}

/**
 * Stacked achievement badge overlay. Renders on top of the Result screen.
 * Each badge slides in with a tier-specific spring animation.
 */
const AchievementPopup = ({ achievementIds, visible }: Props) => {
  const reduced = useReducedMotion() ?? false

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
            />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default AchievementPopup
