/**
 * SoloLeaderboard — shows the final solo-play results sorted by score.
 * Highlights the current player's entry.
 */
import type { SoloScoreEntry } from "@razzoozle/common/types/game"
import Avatar from "@razzoozle/web/components/Avatar"
import { useReveal } from "@razzoozle/web/features/game/animation/presets"
import clsx from "clsx"
import { Trophy } from "lucide-react"
import { motion } from "motion/react"
import { useTranslation } from "react-i18next"

interface Props {
  leaderboard: SoloScoreEntry[]
  playerName: string
  totalPoints: number
}

// Format date to a readable locale string (just date portion).
const formatDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
  } catch {
    return iso
  }
}

// Top-3 medal gradients (gold / silver / bronze) for the rank badge.
const MEDAL_GRADIENT = [
  "from-yellow-400 to-yellow-600", // 1st
  "from-gray-300 to-gray-500",     // 2nd
  "from-amber-600 to-amber-800",   // 3rd
]

const SoloLeaderboard = ({ leaderboard, playerName, totalPoints }: Props) => {
  const { t } = useTranslation()
  const reveal = useReveal()

  // Sort descending by score (the server should return them sorted, but be safe).
  const sorted = [...leaderboard].sort((a, b) => b.score - a.score)

  // Find the best-match index for the current player.
  // On a tie (same name + score) we want the LAST matching entry, which
  // corresponds to the most-recently submitted run (server appends, sort is
  // stable, so the newest entry comes last before the sort reversal — we pick
  // the last after sort to stay consistent with "most recent wins").
  const myIndex = sorted.reduce<number>(
    (found, e, i) =>
      e.playerName === playerName && e.score === totalPoints ? i : found,
    -1,
  )

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4">
      <div className="flex items-center justify-center gap-2 text-2xl font-bold text-white drop-shadow-lg">
        <Trophy className="size-7 text-yellow-300" aria-hidden />
        {t("game:solo.soloLeaderboard")}
      </div>

      {sorted.length === 0 ? (
        <p className="text-center text-white/70">{t("game:solo.noScores", "—")}</p>
      ) : (
        <motion.ol
          className="flex flex-col gap-2"
          variants={reveal.container()}
          initial="hidden"
          animate="visible"
        >
          {sorted.map((entry, i) => {
            const isMe = i === myIndex
            const isMedal = i < 3
            return (
              <motion.li
                key={`${entry.playerName}-${entry.answeredAt}-${i}`}
                // `layout` makes rank shifts (entries reordering by score)
                // glide on the lifecycle spring — a moment, not a hot-path tick.
                layout
                variants={reveal.item()}
                transition={reveal.spring}
                className={clsx(
                  "flex items-center gap-3 rounded-xl px-4 py-3 text-white",
                  isMe
                    ? "bg-white/25 ring-2 ring-white/80"
                    : "bg-black/30",
                )}
                aria-current={isMe ? "true" : undefined}
              >
                {/* Rank */}
                <span
                  className={clsx(
                    "shrink-0 text-center font-bold",
                    isMedal
                      ? "flex size-8 items-center justify-center rounded-full bg-gradient-to-br text-base text-white shadow"
                      : "w-8 text-xl text-white/60",
                    isMedal && MEDAL_GRADIENT[i],
                  )}
                >
                  {i + 1}{isMedal ? "" : "."}
                </span>

                {/* Avatar */}
                <Avatar name={entry.playerName} size={36} />

                {/* Name + date */}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">
                    {entry.playerName}
                    {isMe && (
                      <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold">
                        ★
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-white/60">{formatDate(entry.answeredAt)}</p>
                </div>

                {/* Score */}
                <span className="shrink-0 rounded-lg bg-black/40 px-3 py-1 font-mono text-lg font-bold tabular-nums">
                  {entry.score}
                </span>
              </motion.li>
            )
          })}
        </motion.ol>
      )}
    </div>
  )
}

export default SoloLeaderboard
