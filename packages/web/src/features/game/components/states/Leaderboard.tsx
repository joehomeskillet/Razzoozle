import type { MergedAchievement } from "@razzoozle/common/achievements"
import type { ManagerStatusDataMap } from "@razzoozle/common/types/game/status"
import Avatar from "@razzoozle/web/components/Avatar"
import { useReveal } from "@razzoozle/web/features/game/animation/presets"
import AchievementMedal from "@razzoozle/web/features/game/components/AchievementMedal"
import AnimatedPoints from "@razzoozle/web/features/game/components/AnimatedPoints"
import Fire from "@razzoozle/web/features/game/components/icons/Fire"
import TeamLeaderboard from "@razzoozle/web/features/game/components/TeamLeaderboard"
import {
  ACHIEVEMENT_META,
  TIER_INDEX,
  getAchievementDisplay,
  loadAchievementMeta,
} from "@razzoozle/web/features/game/utils/achievements"
import type { AchievementTier } from "@razzoozle/web/features/game/utils/achievements"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

interface Props {
  data: ManagerStatusDataMap["SHOW_LEADERBOARD"]
}

// Tokenized tier banner gradient — built from the frozen --tier-* CSS vars so a
// skeleton can re-color leaderboard banners. Defaults match the prior palette.
const TIER_GRADIENT_VAR: Record<AchievementTier, string> = {
  bronze:
    "linear-gradient(to right, var(--tier-bronze), color-mix(in srgb, var(--tier-bronze), black 18%))",
  silver:
    "linear-gradient(to right, var(--tier-silver), color-mix(in srgb, var(--tier-silver), black 18%))",
  gold:
    "linear-gradient(to right, var(--tier-gold), color-mix(in srgb, var(--tier-gold), black 12%))",
  diamant:
    "linear-gradient(to right, var(--tier-diamant), color-mix(in srgb, var(--tier-diamant), black 12%))",
}

// ─── Streak badge ─────────────────────────────────────────────────────────────

const StreakBadge = ({ streak }: { streak: number }) => {
  const reveal = useReveal()
  return (
    <AnimatePresence>
      {streak >= 2 && (
        <motion.div
          key="streak"
          initial={{ opacity: 0, scale: reveal.reduced ? 1 : 0.5, x: reveal.reduced ? 0 : -10 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          exit={{ opacity: 0, scale: reveal.reduced ? 1 : 0.5, x: reveal.reduced ? 0 : -10 }}
          transition={reveal.spring}
          className="ml-2 flex items-center gap-1 rounded-full bg-[var(--streak-color)] p-1"
        >
          <Fire className="size-7" />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ─── Climber / faller rank-delta emphasis ────────────────────────────────────

type RankMove = "up" | "down" | "same"

/** Cheap, CSS-only emphasis chip shown next to a row that moved this round. */
const RankDeltaChip = ({ move, delta }: { move: RankMove; delta: number }) => {
  const { t } = useTranslation()
  if (move === "same" || delta === 0) return null

  const up = move === "up"
  const label = up
    ? t("game:rankUp", { defaultValue: "{{count}} hoch", count: delta })
    : t("game:rankDown", { defaultValue: "{{count}} runter", count: delta })

  return (
    <span
      role="status"
      aria-label={label}
      className={[
        "flex flex-shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5",
        "text-xs font-bold tabular-nums leading-none",
        up
          ? "bg-[var(--rank-up-soft)] text-emerald-700"
          : "bg-[var(--rank-down-soft)] text-rose-700",
      ].join(" ")}
    >
      <span aria-hidden="true">{up ? "▲" : "▼"}</span>
      {delta}
    </span>
  )
}

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
  const reveal = useReveal()
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
              variants={reveal.pop(0.5)}
              initial="hidden"
              animate="visible"
              exit="hidden"
              transition={
                reveal.reduced
                  ? reveal.spring
                  : { ...reveal.snap, delay: i * 0.07 }
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
  bronze: "var(--tier-bronze-glow)",
  silver: "var(--tier-silver-glow)",
  gold: "var(--tier-gold-glow)",
  diamant: "var(--tier-diamant-glow)",
}

// Tier-conditional text color for banner - white only on bronze, ink on others
const BANNER_TEXT_COLOR: Record<AchievementTier, string> = {
  bronze: "text-white",
  silver: "text-[var(--answer-text)]",
  gold: "text-[var(--answer-text)]",
  diamant: "text-[var(--answer-text)]",
}

const CelebratoryBanner = ({
  tier,
  playerName,
  achievementName,
  icon,
  show,
}: BannerProps) => {
  const reduced = useReducedMotion() ?? false
  const { t } = useTranslation()

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="banner"
          role="status"
          aria-live="polite"
          aria-label={`${playerName} ${t("game:achievementBanner.wins")} ${t(`game:tier.${tier}`)}: ${achievementName}`}
          initial={{ opacity: 0, y: reduced ? 0 : -24, scale: reduced ? 1 : 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: reduced ? 0 : -16 }}
          transition={
            reduced
              ? { duration: 0.3 }
              : { type: "spring", stiffness: 300, damping: 20 }
          }
          style={{
            backgroundImage: TIER_GRADIENT_VAR[tier],
            boxShadow: BANNER_GLOW[tier],
          }}
          className={[
            "mb-4 flex items-center gap-3 rounded-2xl px-5 py-3",
            BANNER_TEXT_COLOR[tier],
            "font-bold drop-shadow-xl",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {/* Medallion icon */}
          <AchievementMedal id={achievementName} tier={tier} size="md" />

          {/* Text */}
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-semibold opacity-80 tabular-nums">
              {t(`game:tier.${tier}`)}
            </span>
            <span className="text-base lg:text-lg">
              <span className="font-extrabold">{playerName}</span>
              {" "}{t("game:achievementBanner.wins")}{" "}
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
  const reveal = useReveal()
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

  // Climber / faller emphasis — rank delta (old index → new index) per player.
  // Cheap O(n) map built once per leaderboard change; consulted with a Map lookup
  // in render so a top-5 (server-sliced) list stays light (no per-row .findIndex scans).
  const rankMoves = useMemo(() => {
    const oldRank = new Map<string, number>()
    oldLeaderboard.forEach((p, i) => oldRank.set(p.id, i))

    const moves = new Map<string, { move: RankMove; delta: number }>()
    leaderboard.forEach((p, newIndex) => {
      const prev = oldRank.get(p.id)
      if (prev === undefined) {
        moves.set(p.id, { move: "same", delta: 0 })
        return
      }
      const diff = prev - newIndex
      moves.set(p.id, {
        move: diff > 0 ? "up" : diff < 0 ? "down" : "same",
        delta: Math.abs(diff),
      })
    })
    return moves
  }, [oldLeaderboard, leaderboard])

  // Old/new point maps — built once per leaderboard change so the per-row
  // AnimatedPoints from/to lookups are O(1) Map gets instead of O(n) .find()
  // scans over both arrays on every row of a top-5 (server-sliced) list.
  const oldPoints = useMemo(() => {
    const m = new Map<string, number>()
    oldLeaderboard.forEach((p) => m.set(p.id, p.points))
    return m
  }, [oldLeaderboard])

  const newPoints = useMemo(() => {
    const m = new Map<string, number>()
    leaderboard.forEach((p) => m.set(p.id, p.points))
    return m
  }, [leaderboard])

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
    <section className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-start px-2">
      <h2 className="mb-6 text-5xl font-bold text-[color:var(--game-fg)] drop-shadow-md lg:text-[clamp(3rem,7vh,7rem)]">
        {t("game:leaderboard.title")}
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

      <div data-testid="leaderboard-table" className="flex w-full flex-col gap-2 overflow-x-hidden overflow-y-auto min-h-0 touch-pan-y overscroll-contain">
        <AnimatePresence mode="popLayout">
          {displayedLeaderboard.map(
            ({ id, username, points, streak, avatar, achievements }) => {
              const rank = rankMoves.get(id)
              // Emphasis only once rows have settled into their new order.
              const emphasize = isAnimating && rank !== undefined
              const climbing = emphasize && rank.move === "up"
              const falling = emphasize && rank.move === "down"

              return (
                <motion.div
                  data-testid={`leaderboard-row-${username}`}
                  key={id}
                  layout={!reveal.reduced}
                  initial={{ opacity: 0, y: 50 }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    // One-shot overshoot pulse for climbers; reduced-motion holds at 1.
                    // No fabricated motion — useReveal honours reduced via reveal.spring.
                    scale: climbing && !reveal.reduced ? [1, 1.06, 1] : 1,
                  }}
                  exit={{
                    opacity: 0,
                    y: 50,
                    transition: reveal.tween(0.2),
                  }}
                  transition={{
                    layout: reveal.spring,
                    default: reveal.spring,
                    scale: reveal.reduced
                      ? reveal.spring
                      : reveal.tween(0.45),
                  }}
                  className={[
                    "flex w-full flex-col gap-1 rounded-xl bg-[var(--color-accent)] p-3 text-3xl font-bold text-[var(--accent-contrast-text)] lg:text-[clamp(1.5rem,4vh,4rem)]",
                    // Cheap CSS ring/opacity emphasis — keeps the top-5 (server-sliced) hot path light.
                    "transition-shadow",
                    climbing
                      ? "shadow-[0_0_0_3px_rgba(16,185,129,0.7)]"
                      : "",
                    falling ? "opacity-80" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {/* Main row: avatar + name + streak + points */}
                  <div className="flex w-full items-center justify-between">
                    <span className="flex items-center gap-2 drop-shadow-md">
                      <Avatar src={avatar} name={username} size={36} />
                      {username}
                      <StreakBadge streak={streak} />
                      {emphasize && (
                        <RankDeltaChip move={rank.move} delta={rank.delta} />
                      )}
                    </span>
                    {isAnimating ? (
                      <AnimatedPoints
                        from={oldPoints.get(id) ?? 0}
                        to={newPoints.get(id) ?? 0}
                      />
                    ) : (
                      <span className="tabular-nums drop-shadow-md">
                        {points}
                      </span>
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
              )
            },
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}

export default Leaderboard
