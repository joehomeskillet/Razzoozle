import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import CricleCheck from "@razzia/web/features/game/components/icons/CricleCheck"
import CricleXmark from "@razzia/web/features/game/components/icons/CricleXmark"
import RewardStack from "@razzia/web/features/game/components/RewardStack"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import { SFX } from "@razzia/web/features/game/utils/constants"
import { playFirstCorrectSound } from "@razzia/web/features/game/utils/firstCorrectSound"
import { rankKeyFor } from "@razzia/web/features/game/utils/rank"
import {
  ACHIEVEMENT_META,
  highestTier,
} from "@razzia/web/features/game/utils/achievements"
import { fireTierConfetti } from "@razzia/web/features/game/utils/confetti"
import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import useSound from "use-sound"
import { useReducedMotion } from "motion/react"

interface Props {
  data: CommonStatusDataMap["SHOW_RESULT"]
}

const LS_KEY = "rahoot_achievements"

/** Read the {id: count} map from localStorage, increment the given ids, write back. */
function persistAchievements(ids: string[]): void {
  if (ids.length === 0) return
  try {
    const raw = localStorage.getItem(LS_KEY)
    const stored: Record<string, number> = raw ? JSON.parse(raw) : {}
    for (const id of ids) {
      stored[id] = (stored[id] ?? 0) + 1
    }
    localStorage.setItem(LS_KEY, JSON.stringify(stored))
  } catch {
    // localStorage unavailable — silently skip
  }
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
    achievements,
    bonusPoints,
  },
}: Props) => {
  const player = usePlayerStore()
  const { t } = useTranslation()
  const rankKey = rankKeyFor(rank)
  const reduced = useReducedMotion() ?? false
  const achievementsFired = useRef(false)

  const [sfxResults] = useSound(SFX.RESULTS_SOUND, { volume: 0.2 })
  const [sfxBronze] = useSound(SFX.TIERS.BRONZE, { volume: 0.4 })
  const [sfxSilver] = useSound(SFX.TIERS.SILVER, { volume: 0.4 })
  const [sfxGold] = useSound(SFX.TIERS.GOLD, { volume: 0.4 })
  const [sfxDiamant] = useSound(SFX.TIERS.DIAMANT, { volume: 0.4 })

  useEffect(() => {
    player.updatePoints(myPoints)

    if (firstCorrect) {
      playFirstCorrectSound()
    } else {
      sfxResults()
    }
    // oxlint-disable-next-line
  }, [sfxResults])

  useEffect(() => {
    const ids = achievements ?? []
    if (ids.length === 0 || achievementsFired.current) return
    achievementsFired.current = true

    persistAchievements(ids)

    // Play the highest tier chime once
    const tiers = ids
      .map((id) => ACHIEVEMENT_META[id]?.tier)
      .filter((t): t is NonNullable<typeof t> => t !== undefined)
    const top = highestTier(tiers)

    if (top === "diamant") sfxDiamant()
    else if (top === "gold") sfxGold()
    else if (top === "silver") sfxSilver()
    else if (top === "bronze") sfxBronze()

    // Small delay so the popup animation starts first
    const timer = setTimeout(() => {
      fireTierConfetti(ids, reduced)
    }, 300)

    return () => clearTimeout(timer)
    // oxlint-disable-next-line
  }, [])

  const unlockedIds = achievements ?? []

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
        <span className="mt-2 rounded-[var(--radius-theme)] bg-black/40 px-4 py-2 text-2xl font-bold text-white tabular-nums drop-shadow-lg">
          +{points}
        </span>
      )}

      <RewardStack
        streak={streak}
        streakBonus={streakBonus}
        bonus={bonus}
        firstCorrect={firstCorrect}
        achievementIds={unlockedIds}
        visible={true}
        bonusPoints={bonusPoints}
      />
    </section>
  )
}

export default Result
