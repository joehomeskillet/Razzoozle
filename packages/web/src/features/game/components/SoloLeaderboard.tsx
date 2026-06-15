/**
 * SoloLeaderboard — shows the final solo-play results sorted by score.
 * Highlights the current player's entry.
 */
import type { SoloScoreEntry } from "@razzia/common/types/game"
import Avatar from "@razzia/web/components/Avatar"
import clsx from "clsx"
import { Trophy } from "lucide-react"
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

const MEDAL_COLORS = [
  "text-yellow-300",   // 1st
  "text-slate-300",    // 2nd
  "text-amber-600",    // 3rd
]

const SoloLeaderboard = ({ leaderboard, playerName, totalPoints }: Props) => {
  const { t } = useTranslation()

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
        <ol className="flex flex-col gap-2">
          {sorted.map((entry, i) => {
            const isMe = i === myIndex
            return (
              <li
                key={`${entry.playerName}-${entry.answeredAt}-${i}`}
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
                    "w-8 shrink-0 text-center text-xl font-bold",
                    i < 3 ? MEDAL_COLORS[i] : "text-white/60",
                  )}
                >
                  {i + 1}.
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
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

export default SoloLeaderboard
