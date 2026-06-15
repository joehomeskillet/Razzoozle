import type { MergedAchievement } from "@razzia/common/achievements"
import type { ManagerStatusDataMap } from "@razzia/common/types/game/status"
import Avatar from "@razzia/web/components/Avatar"
import AchievementMedal from "@razzia/web/features/game/components/AchievementMedal"
import AnimatedPoints from "@razzia/web/features/game/components/AnimatedPoints"
import Fire from "@razzia/web/features/game/components/icons/Fire"
import TeamLeaderboard from "@razzia/web/features/game/components/TeamLeaderboard"
import {
  ACHIEVEMENT_META,
  TIER_GRADIENT,
  TIER_INDEX,
  TIER_LABEL,
  getAchievementDisplay,
  loadAchievementMeta,
} from "@razzia/web/features/game/utils/achievements"
import type { AchievementTier } from "@razzia/web/features/game/utils/achievements"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

interface Props {
  data: ManagerStatusDataMap["SHOW_LEADERBOARD"]
}

// ─── Streak badge ─────────────────────────────────────────────────────────────

const StreakBadge = ({ streak }: { streak: number }) => (
  <AnimatePresence>
    {streak >= 2 && (
      <motion.div
        key="streak"
        initial={{ opacity: 0, scale: 0.5, x: -10 }}
        animate={{ opacity: 1, scale: 1, x: 0 }}
        exit={{ opacity: 0, scale: 0.5, x: -10 }}
        transition={{ type: "spring", stiffness: 400, damping: 20 }}
        className="ml-2 flex items-center gap-1 rounded-full bg-amber-700 p-1"
      >
        <Fire className="size-7" />
      </motion.div>
    )}
  </AnimatePresence>
)

// ─── Achievement chip row (per player) ───────────────────────────────────────

interface AchievementChipsProps {
  achievementIds: string[]
  /** Set to true once rank animation has settled. */
  show: boolean
  mergedList: MergedAchievement[]
}

const AchievementChips = ({
  achievementIds,
  show,
  mergedList,
}: AchievementChipsProps) => {
  const reduced = useReducedMotion() ?? false
  const { t } = useTranslation()

  if (!achievementIds.length) return null

  return (
    <AnimatePresence>
      {show &&
        achievementIds.map((id, i) => {
          const meta = ACHIEVEMENT_META[id]
          if (!meta) return null

          const merged = mergedList.find((m) => m.id === id)
          const { name } = getAchievementDisplay(id, merged, {
            name: t(`game:achievements.${id}.name`, {
              defaultValue: id.replace(/_/g, " "),
            }),
            desc: "",
          })

          return (
            <motion.span
              key={id}
              initial={{ opacity: 0, scale: reduced ? 1 : 0.5, y: reduced ? 0 : -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: reduced ? 1 : 0.5 }}
              transition={
                reduced
                  ? { duration: 0.2 }
                  : {
                      type: "spring",
                      stiffness: 380,
                      damping: 22,
                      delay: i * 0.07,
                    }
              }
              className="flex-shrink-0"
              title={name}
            >
              <AchievementMedal
                id={id}
                tier={meta.tier}
                size="sm"
                aria-label={name}
              />
            </motion.span>
          )
        })}
    </AnimatePresence>
  )
}

// ─── Celebratory banner (highest-tier unlock for this round) ─────────────────

interface BannerProps {
  tier: AchievementTier
  playerName: string
  achievementName: string
  icon: string
  show: boolean
}

const BANNER_GLOW: Record<AchievementTier, string> = {
  bronze: "",
  silver: "",
  gold: "shadow-[0_0_32px_rgba(250,204,21,0.55)]",
  diamant: "shadow-[0_0_40px_rgba(34,211,238,0.6)]",
}

const CelebratoryBanner = ({
  tier,
  playerName,
  achievementName,
  icon,
  show,
}: BannerProps) => {
  const reduced = useReducedMotion() ?? false

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="banner"
          role="status"
          aria-live="polite"
          aria-label={`${playerName} holt ${TIER_LABEL[tier]}: ${achievementName}`}
          initial={{ opacity: 0, y: reduced ? 0 : -24, scale: reduced ? 1 : 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: reduced ? 0 : -16 }}
          transition={
            reduced
              ? { duration: 0.3 }
              : { type: "spring", stiffness: 300, damping: 20 }
          }
          className={[
            "mb-4 flex items-center gap-3 rounded-2xl px-5 py-3",
            "bg-gradient-to-r",
            TIER_GRADIENT[tier],
            "text-white font-bold drop-shadow-xl",
            BANNER_GLOW[tier],
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {/* Medallion icon */}
          <AchievementMedal id={achievementName} tier={tier} size="md" />

          {/* Text */}
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-semibold opacity-80 tabular-nums">
              {TIER_LABEL[tier]}
            </span>
            <span className="text-base lg:text-lg">
              <span className="font-extrabold">{playerName}</span>
              {" holt "}
              {icon}{" "}
              <span className="italic">{achievementName}</span>
            </span>
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

const Leaderboard = ({
  data: { oldLeaderboard, leaderboard, teamStandings },
}: Props) => {
  const [displayedLeaderboard, setDisplayedLeaderboard] =
    useState(oldLeaderboard)
  const [isAnimating, setIsAnimating] = useState(false)
  /** True once the 1600 ms rank transition has settled and chips should appear. */
  const [chipsVisible, setChipsVisible] = useState(false)
  const [mergedList, setMergedList] = useState<MergedAchievement[]>([])
  const { t } = useTranslation()

  // Load server name overrides once on mount.
  useEffect(() => {
    loadAchievementMeta().then(setMergedList).catch(() => {})
  }, [])

  useEffect(() => {
    setDisplayedLeaderboard(oldLeaderboard)
    setIsAnimating(false)
    setChipsVisible(false)

    const rankTimer = setTimeout(() => {
      setIsAnimating(true)
      setDisplayedLeaderboard(leaderboard)
    }, 1600)

    // Chips appear ~400 ms after the rank animation fires (rows have settled).
    const chipsTimer = setTimeout(() => {
      setChipsVisible(true)
    }, 2100)

    return () => {
      clearTimeout(rankTimer)
      clearTimeout(chipsTimer)
    }
  }, [oldLeaderboard, leaderboard])

  // Derive the highest-tier unlock across all CURRENT leaderboard rows.
  const bannerInfo = useMemo(() => {
    type BestEntry = {
      tier: AchievementTier
      playerId: string
      achievementId: string
    } | null

    let best: BestEntry = null

    for (const player of leaderboard) {
      const ids = player.achievements
      if (!ids?.length) continue

      for (const id of ids) {
        const meta = ACHIEVEMENT_META[id]
        if (!meta) continue

        if (
          !best ||
          TIER_INDEX[meta.tier] > TIER_INDEX[best.tier]
        ) {
          best = { tier: meta.tier, playerId: player.id, achievementId: id }
        }
      }
    }

    if (!best) return null

    const player = leaderboard.find((p) => p.id === best!.playerId)
    if (!player) return null

    const id = best.achievementId
    const meta = ACHIEVEMENT_META[id]!
    const merged = mergedList.find((m) => m.id === id)
    const { name } = getAchievementDisplay(id, merged, {
      name: t(`game:achievements.${id}.name`, {
        defaultValue: id.replace(/_/g, " "),
      }),
      desc: "",
    })

    return {
      tier: best.tier,
      playerName: player.username,
      achievementName: name,
      achievementId: id,
      icon: meta.icon,
    }
  }, [leaderboard, mergedList, t])

  return (
    <section className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-2">
      <h2 className="mb-6 text-5xl font-bold text-white drop-shadow-md lg:text-[clamp(3rem,7vh,7rem)]">
        {t("game:leaderboard")}
      </h2>

      {/* Celebratory banner — highest-tier unlock across this round */}
      {bannerInfo && (
        <CelebratoryBanner
          tier={bannerInfo.tier}
          playerName={bannerInfo.playerName}
          achievementName={bannerInfo.achievementName}
          icon={bannerInfo.icon}
          show={chipsVisible}
        />
      )}

      {/* Team standings — rendered above the per-player list when present. */}
      {teamStandings && teamStandings.length > 0 && (
        <TeamLeaderboard standings={teamStandings} />
      )}

      <div className="flex w-full flex-col gap-2">
        <AnimatePresence mode="popLayout">
          {displayedLeaderboard.map(
            ({ id, username, points, streak, avatar, achievements }) => (
              <motion.div
                key={id}
                layout
                initial={{ opacity: 0, y: 50 }}
                animate={{
                  opacity: 1,
                  y: 0,
                }}
                exit={{
                  opacity: 0,
                  y: 50,
                  transition: { duration: 0.2 },
                }}
                transition={{
                  layout: {
                    type: "spring",
                    stiffness: 350,
                    damping: 25,
                  },
                }}
                className="flex w-full flex-col gap-1 rounded-xl bg-[var(--color-accent)] p-3 text-3xl font-bold text-white lg:text-[clamp(1.5rem,4vh,4rem)]"
              >
                {/* Main row: avatar + name + streak + points */}
                <div className="flex w-full items-center justify-between">
                  <span className="flex items-center gap-2 drop-shadow-md">
                    <Avatar src={avatar} name={username} size={36} />
                    {username}
                    <StreakBadge streak={streak} />
                  </span>
                  {isAnimating ? (
                    <AnimatedPoints
                      from={
                        oldLeaderboard.find((u) => u.id === id)?.points ?? 0
                      }
                      to={leaderboard.find((u) => u.id === id)?.points ?? 0}
                    />
                  ) : (
                    <span className="tabular-nums drop-shadow-md">{points}</span>
                  )}
                </div>

                {/* Achievement chips — staggered spring after rank animation */}
                {achievements && achievements.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 pl-1">
                    <AchievementChips
                      achievementIds={achievements}
                      show={chipsVisible}
                      mergedList={mergedList}
                    />
                  </div>
                )}
              </motion.div>
            ),
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}

export default Leaderboard
