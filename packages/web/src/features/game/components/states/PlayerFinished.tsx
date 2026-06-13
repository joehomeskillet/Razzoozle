import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import { rankKeyFor } from "@razzia/web/features/game/utils/rank"
import { useTranslation } from "react-i18next"

interface Props {
  data: CommonStatusDataMap["FINISHED"]
}

const PlayerFinished = ({ data: { rank, subject } }: Props) => {
  const { player } = usePlayerStore()
  const { t } = useTranslation()

  const rankKey = typeof rank === "number" ? rankKeyFor(rank) : null

  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-4 px-4">
      <p className="text-center text-4xl font-bold text-white drop-shadow-lg md:text-5xl">
        {subject}
      </p>

      <p className="text-center text-3xl font-bold text-white drop-shadow-lg md:text-4xl">
        {rankKey !== null ? t(rankKey, { rank }) : "—"}
      </p>

      <p className="mt-2 rounded bg-black/40 px-6 py-2 text-2xl font-bold text-white tabular-nums">
        {player?.points ?? 0} pts
      </p>

      {/* Public entry point to the question-submission page. Standalone flow,
          so a plain anchor / full navigation is fine and keeps Cmd-click. Kept
          subtle (below the score) so it doesn't crowd the result. */}
      <a
        href="/submit"
        className="focus-visible:ring-primary/60 mt-4 inline-flex min-h-11 items-center rounded px-3 py-2 text-center text-base font-semibold text-white underline-offset-4 drop-shadow-lg hover:underline focus-visible:ring-2 focus-visible:outline-none"
      >
        {t("submit:cta.afterGame")}
      </a>
    </div>
  )
}

export default PlayerFinished
