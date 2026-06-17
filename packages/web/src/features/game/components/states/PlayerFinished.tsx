import type { CommonStatusDataMap } from "@razzoozle/common/types/game/status"
import { useReveal } from "@razzoozle/web/features/game/animation/presets"
import { usePlayerStore } from "@razzoozle/web/features/game/stores/player"
import { rankKeyFor } from "@razzoozle/web/features/game/utils/rank"
import { motion } from "motion/react"
import { useTranslation } from "react-i18next"

interface Props {
  data: CommonStatusDataMap["FINISHED"]
}

const PlayerFinished = ({ data: { rank, subject } }: Props) => {
  const { player } = usePlayerStore()
  const { t } = useTranslation()
  const reveal = useReveal()

  const rankKey = typeof rank === "number" ? rankKeyFor(rank) : null

  return (
    <motion.div
      className="flex h-full flex-1 flex-col items-center justify-center gap-4 px-4"
      variants={reveal.container()}
      initial="hidden"
      animate="visible"
    >
      <motion.p
        className="text-center text-4xl font-bold text-white drop-shadow-lg md:text-5xl"
        variants={reveal.pop()}
        transition={reveal.spring}
      >
        {subject}
      </motion.p>

      <motion.p
        className="text-center text-3xl font-bold text-white drop-shadow-lg md:text-4xl"
        variants={reveal.item()}
        transition={reveal.spring}
      >
        {rankKey !== null ? t(rankKey, { rank }) : "—"}
      </motion.p>

      <motion.p
        className="mt-2 rounded bg-black/40 px-6 py-2 text-2xl font-bold text-white tabular-nums"
        variants={reveal.item()}
        transition={reveal.spring}
      >
        {player?.points ?? 0} pts
      </motion.p>

      {/* Public entry point to the question-submission page. Standalone flow,
          so a plain anchor / full navigation is fine and keeps Cmd-click. Kept
          subtle (below the score) so it doesn't crowd the result. */}
      <motion.a
        href="/submit"
        className="focus-visible:ring-primary/60 mt-4 inline-flex min-h-11 items-center rounded px-3 py-2 text-center text-base font-semibold text-white underline-offset-4 drop-shadow-lg hover:underline focus-visible:ring-2 focus-visible:outline-none"
        variants={reveal.item()}
        transition={reveal.spring}
      >
        {t("submit:cta.afterGame")}
      </motion.a>
    </motion.div>
  )
}

export default PlayerFinished
