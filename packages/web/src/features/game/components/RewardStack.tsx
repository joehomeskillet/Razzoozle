/**
 * RewardStack — unified, dismissible "Reward Stack" for the player result screen.
 *
 * Supersedes the old AchievementPopup overlay AND the inline bonus pills: every
 * round reward (achievements first, then streak / double-bonus / first-correct)
 * is rendered as an identical <RewardRow>, highest-tier achievement first.
 *
 * Rows are dismissible (close button, swipe, auto-timeout) and the whole stack
 * is reduced-motion-gated. Server name/description overrides are honored via
 * loadAchievementMeta() + getAchievementDisplay() (moved here from AchievementPopup).
 *
 * No server/type/schema change — purely presentational over the SHOW_RESULT payload.
 */

import type { MergedAchievement } from "@razzoozle/common/achievements"
import AchievementMedal from "@razzoozle/web/features/game/components/AchievementMedal"
import RewardRow from "@razzoozle/web/features/game/components/RewardRow"
import {
  ACHIEVEMENT_META,
  TIER_ACCENT,
  TIER_INDEX,
  TIER_LABEL,
  getAchievementDisplay,
  loadAchievementMeta,
  type AchievementMeta,
} from "@razzoozle/web/features/game/utils/achievements"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Coins, Flame, Star, Zap } from "lucide-react"
import type { ReactNode } from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

interface RewardItem {
  id: string
  icon: ReactNode
  title: string
  value?: string
  badge?: string
  accent: string
  durationMs: number
}

interface Props {
  streak?: number
  streakBonus?: boolean
  bonus?: boolean
  firstCorrect?: boolean
  achievementIds: string[]
  visible: boolean
  // Sum of achievement bonus points unlocked this round (already in myPoints).
  bonusPoints?: number
}

const RewardStack = ({
  streak,
  streakBonus,
  bonus,
  firstCorrect,
  achievementIds,
  visible,
  bonusPoints,
}: Props) => {
  const reduced = useReducedMotion() ?? false
  const { t } = useTranslation()

  // Server-merged metadata (name/description overrides). Fetched at most once.
  const [mergedList, setMergedList] = useState<MergedAchievement[]>([])
  useEffect(() => {
    loadAchievementMeta().then((list) => {
      if (list.length > 0) setMergedList(list)
    })
  }, [])

  // Build the full, ordered reward list: achievements (highest tier first), then bonuses.
  const items = useMemo<RewardItem[]>(() => {
    const result: RewardItem[] = []

    // Achievements — highest tier first
    const metas = achievementIds
      .map((id) => ACHIEVEMENT_META[id])
      .filter((m): m is AchievementMeta => m !== undefined)
      .sort((a, b) => TIER_INDEX[b.tier] - TIER_INDEX[a.tier])

    for (const meta of metas) {
      const merged = mergedList.find((m) => m.id === meta.id)
      const display = getAchievementDisplay(meta.id, merged, {
        name: t(`${meta.i18nKey}.name`, meta.id),
        desc: t(`${meta.i18nKey}.desc`, ""),
      })
      result.push({
        id: meta.id,
        icon: (
          <AchievementMedal
            id={meta.id}
            tier={meta.tier}
            size="sm"
            pulse={meta.tier === "gold" || meta.tier === "diamant"}
          />
        ),
        title: display.name,
        badge: TIER_LABEL[meta.tier],
        accent: TIER_ACCENT[meta.tier],
        durationMs:
          meta.tier === "diamant" ? 7000 : meta.tier === "gold" ? 6000 : 4500,
      })
    }

    // Bonus rows
    // Achievement bonus points (Wave B) — shown when the round unlocked badges
    // that carry a manager-configured bonus. Flows through the same RewardRow.
    if (bonusPoints && bonusPoints > 0) {
      result.push({
        id: "bonus_achievement",
        icon: <Coins className="size-6 text-white" aria-hidden="true" />,
        title: t("game:reward.bonusPoints"),
        value: `+${bonusPoints}`,
        accent: "var(--color-primary)",
        durationMs: 4000,
      })
    }
    if (streakBonus && streak) {
      result.push({
        id: "bonus_streak",
        icon: <Flame className="size-6 text-white" aria-hidden="true" />,
        title: t("game:streak.streakTitle"),
        value: t("game:streak.streakValue", {
          percent: 10 * Math.min(streak - 1, 5),
        }),
        accent: "var(--color-primary)",
        durationMs: 4000,
      })
    }
    if (bonus) {
      result.push({
        id: "bonus_double",
        icon: <Star className="size-6 text-white" aria-hidden="true" />,
        title: t("game:streak.bonus"),
        accent: "var(--answer-4)",
        durationMs: 4000,
      })
    }
    if (firstCorrect) {
      result.push({
        id: "bonus_first",
        icon: <Zap className="size-6 text-white" aria-hidden="true" />,
        title: t("game:streak.firstCorrect"),
        accent: "var(--answer-2)",
        durationMs: 4000,
      })
    }

    return result
    // mergedList drives server overrides; t is stable
    // oxlint-disable-next-line
  }, [
    achievementIds,
    mergedList,
    streak,
    streakBonus,
    bonus,
    firstCorrect,
    bonusPoints,
  ])

  // Dismissed ids — a row stays dismissed even after `items` re-populates
  // (loadAchievementMeta resolves asynchronously, which would otherwise resurrect
  // already-dismissed rows when seeding live state off `items`).
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())
  const handleDismiss = useCallback(
    (id: string) =>
      setDismissed((prev) => {
        const next = new Set(prev)
        next.add(id)
        return next
      }),
    [],
  )

  const liveItems = items.filter((i) => !dismissed.has(i.id))

  if (liveItems.length === 0 || !visible) return null

  return (
    <motion.ul
      role="list"
      aria-live="polite"
      className="mt-3 flex w-full max-w-sm mx-auto flex-col gap-2 px-2 pointer-events-auto"
    >
      <AnimatePresence>
        {liveItems.map((item) => (
          <RewardRow
            key={item.id}
            id={item.id}
            icon={item.icon}
            title={item.title}
            value={item.value}
            badge={item.badge}
            accent={item.accent}
            reduced={reduced}
            durationMs={item.durationMs}
            dismissLabel={t("game:reward.dismiss")}
            onDismiss={handleDismiss}
          />
        ))}
      </AnimatePresence>
    </motion.ul>
  )
}

export default RewardStack
