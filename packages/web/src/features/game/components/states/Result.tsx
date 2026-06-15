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
import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import useSound from "use-sound"
import confetti from "canvas-confetti"
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

/** Fire a confetti burst. Two-sided stream for diamant tier. */
function fireConfetti(
  achievementIds: string[],
  reduced: boolean,
): void {
  if (reduced || achievementIds.length === 0) return

  const tiers = achievementIds
    .map((id) => ACHIEVEMENT_META[id]?.tier)
    .filter((t): t is NonNullable<typeof t> => t !== undefined)

  const top = highestTier(tiers)
  if (!top) return

  if (top === "diamant") {
    // Two-sided stream
    const baseOpts = {
      particleCount: 80,
      spread: 70,
      startVelocity: 55,
      ticks: 200,
      colors: ["#22d3ee", "#a855f7", "#ec4899", "#f0f", "#0ff"],
    }
    void confetti({ ...baseOpts, origin: { x: 0, y: 0.6 }, angle: 60 })
    void confetti({ ...baseOpts, origin: { x: 1, y: 0.6 }, angle: 120 })
  } else {
    const colorMap: Record<string, string[]> = {
      bronze: ["#d97706", "#f59e0b", "#fcd34d"],
      silver: ["#94a3b8", "#cbd5e1", "#e2e8f0"],
      gold: ["#eab308", "#facc15", "#fef08a"],
    }
    void confetti({
      particleCount: 60,
      spread: 60,
      origin: { x: 0.5, y: 0.65 },
      colors: colorMap[top] ?? [],
      ticks: 160,
    })
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
      fireConfetti(ids, reduced)
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
      />
    </section>
  )
}

export default Result
