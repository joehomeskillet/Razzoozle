import type { TeamStanding } from "@razzoozle/common/types/game"
import { useReveal } from "@razzoozle/web/features/game/animation/presets"
import { teamColor } from "@razzoozle/web/features/game/utils/teams"
import { AnimatePresence, motion } from "motion/react"
import { useTranslation } from "react-i18next"

interface Props {
  standings: TeamStanding[]
}

const TeamLeaderboard = ({ standings }: Props) => {
  const { t } = useTranslation()
  const reveal = useReveal()

  if (standings.length === 0) {
    return null
  }

  // Highest points for proportional bar width calculation.
  const maxPoints = standings[0]?.points ?? 1

  return (
    <div className="mb-6 w-full max-w-4xl">
      <h3 className="mb-3 text-2xl font-bold text-[color:var(--game-fg)] drop-shadow-md lg:text-3xl">
        {t("game:teamLeaderboard", { defaultValue: "Teams" })}
      </h3>
      <motion.div
        className="flex flex-col gap-2"
        variants={reveal.container()}
        initial="hidden"
        animate="visible"
      >
        <AnimatePresence mode="popLayout">
          {standings.map((standing, rank) => {
            const colors = teamColor(standing.teamId)
            const barWidth =
              maxPoints > 0
                ? Math.max(4, Math.round((standing.points / maxPoints) * 100))
                : 4

            return (
              <motion.div
                key={standing.teamId}
                layout
                variants={reveal.item(20)}
                exit={
                  reveal.reduced
                    ? { opacity: 0 }
                    : { opacity: 0, y: 20 }
                }
                // Reorder is a lifecycle moment → snappy layout spring (or instant
                // when reduced). Enter/exit fades stay cheap via the tween.
                transition={{
                  layout: reveal.snap,
                  opacity: reveal.tween(),
                  y: reveal.spring,
                }}
                className={`flex items-center gap-3 overflow-hidden rounded-xl p-3 ${colors.bg}`}
              >
                {/* Rank badge */}
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-full text-base font-bold ${colors.bar} text-white`}
                >
                  {rank + 1}
                </span>

                {/* Team name */}
                <span
                  className={`min-w-[4.5rem] shrink-0 text-lg font-bold ${colors.text}`}
                >
                  {t(`game:teams.${standing.teamId}`, {
                    defaultValue:
                      standing.teamId.charAt(0).toUpperCase() +
                      standing.teamId.slice(1),
                  })}
                </span>

                {/* Progress bar */}
                <div className="flex-1 overflow-hidden rounded-full bg-black/10">
                  <motion.div
                    className={`h-3 rounded-full ${colors.bar}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${barWidth}%` }}
                    transition={reveal.reduced ? reveal.spring : reveal.snap}
                  />
                </div>

                {/* Points + player count */}
                <div className="shrink-0 text-right">
                  <span
                    className={`block text-lg font-bold tabular-nums ${colors.text}`}
                  >
                    {standing.points.toLocaleString()}
                  </span>
                  <span className={`block text-xs font-medium ${colors.text} opacity-70`}>
                    {t("game:teamLeaderboard.players", {
                      defaultValue: "{{count}} Spieler",
                      count: standing.playerCount,
                    })}
                  </span>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

export default TeamLeaderboard
