import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import CricleCheck from "@razzia/web/features/game/components/icons/CricleCheck"
import CricleXmark from "@razzia/web/features/game/components/icons/CricleXmark"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import { SFX } from "@razzia/web/features/game/utils/constants"
import { playFirstCorrectSound } from "@razzia/web/features/game/utils/firstCorrectSound"
import { rankKeyFor } from "@razzia/web/features/game/utils/rank"
import { Flame, Star, Zap } from "lucide-react"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import useSound from "use-sound"

interface Props {
  data: CommonStatusDataMap["SHOW_RESULT"]
}

const Result = ({
  data: {
    correct,
    message,
    points,
    myPoints,
    rank,
    aheadOfMe,
    streak,
    streakBonus,
    bonus,
    firstCorrect,
    poll,
  },
}: Props) => {
  const player = usePlayerStore()
  const { t } = useTranslation()
  const rankKey = rankKeyFor(rank)

  const [sfxResults] = useSound(SFX.RESULTS_SOUND, {
    volume: 0.2,
  })

  useEffect(() => {
    player.updatePoints(myPoints)

    // The first-correct winner hears the champions sting; everyone else the
    // normal result sound.
    if (firstCorrect) {
      playFirstCorrectSound()
    } else {
      sfxResults()
    }
    // oxlint-disable-next-line
  }, [sfxResults])

  return (
    <section className="anim-show relative mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center">
      {!poll &&
        (correct ? (
          <CricleCheck className="aspect-square max-h-60 w-full" />
        ) : (
          <CricleXmark className="aspect-square max-h-60 w-full" />
        ))}
      <h2 className="mt-1 text-4xl font-bold text-white drop-shadow-lg">
        {t(message)}
      </h2>
      <p className="mt-1 text-xl font-bold text-white drop-shadow-lg">
        {t("game:resultTop")}
        {t(rankKey, { rank })}
        {aheadOfMe ? `${t("game:resultBehind")}${aheadOfMe}` : ""}
      </p>
      {!poll && correct && (
        <span className="mt-2 rounded-lg bg-black/40 px-4 py-2 text-2xl font-bold tabular-nums text-white drop-shadow-lg">
          +{points}
        </span>
      )}
      {(streakBonus || bonus || firstCorrect) && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {streakBonus && streak ? (
            <span className="bg-primary/90 inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold text-white drop-shadow">
              <Flame className="size-4" aria-hidden="true" /> {streak}er-Serie (+
              {10 * Math.min(streak - 1, 5)}%)
            </span>
          ) : null}
          {bonus && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--answer-4)] px-3 py-1 text-sm font-bold text-white drop-shadow">
              <Star className="size-4" aria-hidden="true" /> Bonus ×2
            </span>
          )}
          {firstCorrect && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--answer-2)] px-3 py-1 text-sm font-bold text-white drop-shadow">
              <Zap className="size-4" aria-hidden="true" /> Schnellste +100
            </span>
          )}
        </div>
      )}
    </section>
  )
}

export default Result
