import type { Player, PlayerRecap } from "@razzoozle/common/types/game"
import type { CommonStatusDataMap } from "@razzoozle/common/types/game/status"
import { useReveal } from "@razzoozle/web/features/game/animation/presets"
import AchievementMedal from "@razzoozle/web/features/game/components/AchievementMedal"
import TrophySticker from "@razzoozle/web/features/game/components/TrophySticker"
import { usePlayerStore } from "@razzoozle/web/features/game/stores/player"
import { useThemeStore } from "@razzoozle/web/features/theme/store"
import {
  ACHIEVEMENT_META,
  TIER_GRADIENT,
  TIER_ORDER,
  TIER_RING,
  TIER_TEXT,
  type AchievementTier,
} from "@razzoozle/web/features/game/utils/achievements"
import { rankKeyFor } from "@razzoozle/web/features/game/utils/rank"
import { safeHex } from "@razzoozle/web/features/game/utils/color"
import useStickerExport from "@razzoozle/web/features/game/utils/useStickerExport"
import clsx from "clsx"
import { Share2, Trophy, Medal } from "lucide-react"
import { motion } from "motion/react"
import { useRef } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

interface Props {
  data: CommonStatusDataMap["FINISHED"]
}

const LS_KEY = "rahoot_achievements"

function readStoredAchievements(): Record<string, number> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function isPlayerRecap(
  recap: CommonStatusDataMap["FINISHED"]["recap"],
): recap is PlayerRecap {
  return (
    recap !== undefined &&
    typeof recap === "object" &&
    "myRecap" in recap &&
    recap.myRecap !== undefined
  )
}

const tierColors: Record<number, string> = {
  1: "var(--tier-gold)",
  2: "var(--tier-silver)",
  3: "var(--tier-bronze)",
}

const TopThreeLeaderboard = ({ topPlayers }: { topPlayers: Player[] }) => {
  const { t } = useTranslation()
  const reveal = useReveal()

  if (!topPlayers || topPlayers.length === 0) {
    return null
  }

  const displayPlayers = topPlayers.slice(0, 3)

  return (
    <motion.section
      className="mt-4 w-full max-w-md"
      variants={reveal.container()}
      initial="hidden"
      animate="visible"
    >
      <motion.h3
        className="mb-3 text-center text-lg font-bold text-[color:var(--game-fg)] drop-shadow"
        variants={reveal.item()}
        transition={reveal.spring}
      >
        {t("game:leaderboard.top3")}
      </motion.h3>

      <motion.div
        className="flex flex-col gap-2"
        variants={reveal.container()}
        initial="hidden"
        animate="visible"
      >
        {displayPlayers.map((player, idx) => {
          const rank = idx + 1
          return (
            <motion.div
              key={player.id}
              className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-sm"
              variants={reveal.item()}
              transition={reveal.spring}
            >
              <Trophy
                className="size-6"
                style={{ color: tierColors[rank] }}
                aria-hidden
              />
              <div className="flex flex-1 flex-col">
                <span className="font-semibold text-[color:var(--color-field-ink)]">
                  {player.username}
                </span>
                <span className="text-sm text-[color:var(--color-field-ink)]/60">
                  {t("game:leaderboard.place", { rank })}
                </span>
              </div>
              <span className="font-bold tabular-nums text-[color:var(--color-field-ink)]">
                {player.points}
              </span>
            </motion.div>
          )
        })}
      </motion.div>
    </motion.section>
  )
}

const MyRecapCard = ({ myRecap }: { myRecap: PlayerRecap["myRecap"] }) => {
  const { t } = useTranslation()
  const reveal = useReveal()

  const fastest =
    myRecap.fastestMs !== null
      ? t("game:recap.myCard.seconds", {
          value: (myRecap.fastestMs / 1000).toFixed(2),
        })
      : t("game:recap.myCard.noFastest")

  const stats: { label: string; value: string }[] = [
    {
      label: t("game:recap.myCard.accuracy"),
      value: `${myRecap.accuracyPct}%`,
    },
    { label: t("game:recap.myCard.correct"), value: `${myRecap.correct}` },
    { label: t("game:recap.myCard.wrong"), value: `${myRecap.wrong}` },
    { label: t("game:recap.myCard.fastest"), value: fastest },
    {
      label: t("game:recap.myCard.peakStreak"),
      value: t("game:recap.myCard.streakValue", { count: myRecap.peakStreak }),
    },
  ]

  return (
    <motion.div
      className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3"
      variants={reveal.container()}
      initial="hidden"
      animate="visible"
    >
      {stats.map((s) => (
        <motion.div
          key={s.label}
          className="flex flex-col items-center gap-0.5 rounded-2xl border border-[var(--border-hairline)] bg-white px-3 py-3 text-center shadow-sm"
          variants={reveal.item()}
          transition={reveal.spring}
        >
          <span className="text-2xl font-extrabold text-[color:var(--color-field-ink)] tabular-nums">
            {s.value}
          </span>
          <span className="text-[11px] font-semibold tracking-wide text-[color:var(--color-field-ink)]/60 uppercase">
            {s.label}
          </span>
        </motion.div>
      ))}
    </motion.div>
  )
}

const HighlightBadge = ({
  highlight,
}: {
  highlight: NonNullable<PlayerRecap["highlight"]>
}) => {
  const { t } = useTranslation()
  const reveal = useReveal()

  return (
    <motion.div
      className="flex w-full flex-col items-center gap-1 rounded-2xl border-2 px-5 py-4 text-center text-[var(--answer-text)]"
      style={{
        background:
          "linear-gradient(to bottom right, color-mix(in srgb, var(--tier-gold), white 18%), color-mix(in srgb, var(--tier-gold), black 22%))",
        borderColor: "color-mix(in srgb, var(--tier-gold), white 35%)",
        boxShadow: "var(--tier-gold-glow)",
      }}
      variants={reveal.pop()}
      initial="hidden"
      animate="visible"
      transition={reveal.spring}
    >
      <Trophy
        className="size-7 drop-shadow"
        style={{ color: "color-mix(in srgb, var(--tier-gold), black 55%)" }}
        aria-hidden
      />
      <span className="text-xs font-bold tracking-widest uppercase opacity-80">
        {t("game:recap.highlight.title")}
      </span>
      <span className="text-xl font-extrabold drop-shadow-sm">
        {t(`game:recap.highlight.${highlight.key}`)}
      </span>
    </motion.div>
  )
}

const TrophySummary = ({ thisGame }: { thisGame: string[] }) => {
  const { t } = useTranslation()
  const reveal = useReveal()

  const stored = readStoredAchievements()
  const thisGameCounts: Record<string, number> = {}
  for (const id of thisGame) {
    thisGameCounts[id] = (thisGameCounts[id] ?? 0) + 1
  }
  const counts: Record<string, number> = { ...stored }
  for (const [id, c] of Object.entries(thisGameCounts)) {
    counts[id] = Math.max(stored[id] ?? 0, c)
  }

  const byTier: Record<AchievementTier, string[]> = {
    bronze: [],
    silver: [],
    gold: [],
    diamant: [],
  }
  for (const [id, c] of Object.entries(counts)) {
    const meta = ACHIEVEMENT_META[id]
    if (meta && c > 0) byTier[meta.tier].push(id)
  }

  const thisGameSet = new Set(thisGame)
  const hasAny = TIER_ORDER.some((tier) => byTier[tier].length > 0)

  return (
    <motion.section
      aria-label={t("game:recap.trophies.title")}
      className="flex w-full flex-col gap-2"
      variants={reveal.container()}
      initial="hidden"
      animate="visible"
    >
      <motion.h3
        className="text-lg font-extrabold text-[color:var(--game-fg)] drop-shadow"
        variants={reveal.item()}
        transition={reveal.spring}
      >
        {t("game:recap.trophies.title")}
      </motion.h3>

      {!hasAny && (
        <p className="text-sm text-[color:var(--game-fg)]/60">
          {t("game:recap.trophies.empty")}
        </p>
      )}

      {TIER_ORDER.map((tier) => {
        const ids = byTier[tier]
        if (ids.length === 0) return null
        return (
          <motion.div
            key={tier}
            className="flex flex-col gap-1.5"
            variants={reveal.item()}
            transition={reveal.spring}
          >
            <span
              className={clsx(
                "inline-block w-fit rounded-full bg-gradient-to-r px-2.5 py-0.5 text-[10px] font-bold tracking-widest uppercase",
                TIER_GRADIENT[tier],
                TIER_TEXT[tier],
              )}
            >
              {t(`game:tier.${tier}`)}
            </span>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {ids.map((id) => {
                const count = counts[id] ?? 0
                const isNew = thisGameSet.has(id)
                const name = t(`game:achievements.${id}.name`, {
                  defaultValue: id.replace(/_/g, " "),
                })
                const aria = isNew
                  ? t("game:recap.trophies.badgeAriaNew", { name, count })
                  : t("game:recap.trophies.badgeAria", { name, count })
                return (
                  <div
                    key={id}
                    title={name}
                    aria-label={aria}
                    className={clsx(
                      "relative flex flex-col items-center gap-1 rounded-2xl px-2 py-2",
                      isNew
                        ? `bg-gradient-to-br ring-2 ${TIER_GRADIENT[tier]} ${TIER_RING[tier]}`
                        : "bg-[color:var(--color-field-ink)]/5 ring-1 ring-[var(--border-hairline)]",
                    )}
                  >
                    <AchievementMedal id={id} tier={tier} size="sm" />
                    {count > 1 && (
                      <span
                        className={clsx(
                          "absolute -top-1 -right-1 rounded-full border border-[var(--border-hairline)] bg-white px-1.5 py-0.5 text-[9px] font-extrabold text-[color:var(--color-field-ink)] tabular-nums shadow-sm",
                        )}
                        aria-hidden
                      >
                        ×{count}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </motion.div>
        )
      })}

      <motion.a
        href="/trophies"
        className="text-primary focus-visible:ring-primary/40 mt-1 inline-flex min-h-11 w-fit items-center gap-1 rounded text-sm font-semibold hover:underline focus-visible:ring-2 focus-visible:outline-none"
        variants={reveal.item()}
        transition={reveal.spring}
      >
        {t("game:recap.trophies.viewAll")}
      </motion.a>
    </motion.section>
  )
}

const ShareStickerButton = ({
  rank,
  name,
  points,
  subject,
  achievements,
}: {
  rank: 1 | 2 | 3
  name: string
  points: number
  subject: string
  achievements: string[]
}) => {
  const { t } = useTranslation()
  const theme = useThemeStore((s) => s.theme)
  const captureRef = useRef<HTMLDivElement>(null)
  const { exportSticker, isExporting } = useStickerExport()

  const onShare = async () => {
    const node = captureRef.current
    if (!node) return
    try {
      const outcome = await exportSticker(node, {
        backgroundColor: safeHex(theme.colorSecondary, "#2e1065"),
      })
      toast.success(t(`game:recap.sticker.${outcome}`))
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return
      toast.error(t("game:recap.sticker.error"))
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onShare}
        disabled={isExporting}
        className="bg-primary focus-visible:ring-primary/60 inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-theme)] px-5 py-2.5 text-base font-bold text-white shadow-lg drop-shadow-lg focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
      >
        <Share2 className="size-5" aria-hidden />
        {isExporting
          ? t("game:recap.sticker.creating")
          : t("game:recap.sticker.create")}
      </button>

      <div
        ref={captureRef}
        aria-hidden
        style={{ position: "fixed", left: -99999, top: 0 }}
      >
        <TrophySticker
          rank={rank}
          name={name}
          points={points}
          subject={subject}
          achievements={achievements}
        />
      </div>
    </>
  )
}

const PlayerFinished = ({ data }: Props) => {
  const { rank, subject, top, recap, endScreen } = data
  const { player } = usePlayerStore()
  const { t } = useTranslation()
  const reveal = useReveal()

  const rankKey = typeof rank === "number" ? rankKeyFor(rank) : null
  const playerRecap = isPlayerRecap(recap) ? recap : null
  const showPublicRanking = endScreen !== "private"

  const isTopThree =
    typeof rank === "number" && rank >= 1 && rank <= 3
      ? (rank as 1 | 2 | 3)
      : null

  return (
    <motion.div
      className="flex h-full flex-1 flex-col items-center gap-4 overflow-y-auto px-4 py-6"
      variants={reveal.container()}
      initial="hidden"
      animate="visible"
    >
      <motion.div
        className="flex w-full max-w-md flex-col items-center gap-3 rounded-2xl border border-[var(--border-hairline)] bg-white px-6 py-6 shadow-md"
        variants={reveal.pop()}
        transition={reveal.spring}
      >
        <motion.p
          className="text-center text-lg font-semibold text-[color:var(--color-field-ink)]/70"
          variants={reveal.item()}
          transition={reveal.spring}
        >
          {subject}
        </motion.p>

        <motion.p
          className="text-center text-4xl font-bold text-[color:var(--game-fg)] drop-shadow-lg"
          variants={reveal.item()}
          transition={reveal.spring}
        >
          {rankKey !== null ? t(rankKey, { rank }) : "—"}
        </motion.p>

        {typeof rank === "number" && rank >= 1 && rank <= 3 && (
          <motion.div
            className="flex flex-col items-center gap-1"
            variants={reveal.item()}
            transition={reveal.spring}
          >
            <Medal
              className="size-10 drop-shadow"
              style={{ color: tierColors[rank] }}
              aria-hidden
            />
          </motion.div>
        )}

        <motion.p
          className="text-center text-2xl font-bold text-[color:var(--color-field-ink)] tabular-nums"
          variants={reveal.item()}
          transition={reveal.spring}
        >
          {player?.points ?? 0} {t("game:recap.sticker.points")}
        </motion.p>
      </motion.div>

      {showPublicRanking && top && top.length > 0 && (
        <TopThreeLeaderboard topPlayers={top} />
      )}

      {playerRecap && (
        <motion.div
          className="flex w-full max-w-md flex-col gap-4"
          variants={reveal.container()}
          initial="hidden"
          animate="visible"
        >
          <motion.h2
            className="text-center text-xl font-extrabold text-[color:var(--game-fg)] drop-shadow"
            variants={reveal.item()}
            transition={reveal.spring}
          >
            {t("game:recap.title")}
          </motion.h2>

          <MyRecapCard myRecap={playerRecap.myRecap} />

          {playerRecap.highlight && (
            <HighlightBadge highlight={playerRecap.highlight} />
          )}

          <TrophySummary thisGame={playerRecap.myRecap.achievements} />
        </motion.div>
      )}

      <motion.div
        className="flex w-full max-w-md flex-col items-center gap-3"
        variants={reveal.container()}
        initial="hidden"
        animate="visible"
      >
        {isTopThree !== null && playerRecap && (
          <motion.div
            variants={reveal.item()}
            transition={reveal.spring}
          >
            <ShareStickerButton
              rank={isTopThree}
              name={player?.username ?? subject}
              points={player?.points ?? 0}
              subject={subject}
              achievements={playerRecap.myRecap.achievements}
            />
          </motion.div>
        )}

        <motion.a
          href="/submit"
          className="focus-visible:ring-primary/60 inline-flex min-h-11 items-center rounded px-3 py-2 text-center text-base font-semibold text-[color:var(--game-fg)] underline-offset-4 drop-shadow-lg hover:underline focus-visible:ring-2 focus-visible:outline-none"
          variants={reveal.item()}
          transition={reveal.spring}
        >
          {t("submit:cta.afterGame")}
        </motion.a>
      </motion.div>
    </motion.div>
  )
}

export default PlayerFinished
