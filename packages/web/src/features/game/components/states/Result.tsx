import type { CommonStatusDataMap } from "@razzoozle/common/types/game/status"
import CricleCheck from "@razzoozle/web/features/game/components/icons/CricleCheck"
import CricleXmark from "@razzoozle/web/features/game/components/icons/CricleXmark"
import RewardStack from "@razzoozle/web/features/game/components/RewardStack"
import { usePlayerStore } from "@razzoozle/web/features/game/stores/player"
import { useSoundStore } from "@razzoozle/web/features/game/stores/sound"
import { SFX } from "@razzoozle/web/features/game/utils/constants"
import { playFirstCorrectSound } from "@razzoozle/web/features/game/utils/firstCorrectSound"
import { rankKeyFor } from "@razzoozle/web/features/game/utils/rank"
import {
  ACHIEVEMENT_META,
  highestTier,
} from "@razzoozle/web/features/game/utils/achievements"
import { fireTierConfetti } from "@razzoozle/web/features/game/utils/confetti"
import { useReveal } from "@razzoozle/web/features/game/animation/presets"
import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import useSound from "use-sound"
import { motion } from "motion/react"

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
    correctAnswer,
    playerCount,
  },
}: Props) => {
  const player = usePlayerStore()
  const muted = useSoundStore((s) => s.muted)
  const { t } = useTranslation()
  const rankKey = rankKeyFor(rank)
  const reveal = useReveal()
  const reduced = reveal.reduced
  const achievementsFired = useRef(false)

  // W1-D FIX 2: only show the place/rank label when the player actually scored
  // (score > 0) AND it is a real multiplayer game (more than one player).
  // Otherwise a hollow "1st place" would appear at 0 points or in a solo game.
  const showRank = myPoints > 0 && (playerCount ?? 1) > 1

  const [sfxResults] = useSound(SFX.RESULTS_SOUND, {
    volume: 0.2,
    soundEnabled: !muted,
  })
  // Wrong-answer chime — reuse the existing boump asset (mirrors SoloAnswers).
  const [sfxWrong] = useSound(SFX.BOUMP_SOUND, {
    volume: 0.3,
    soundEnabled: !muted,
  })
  const [sfxBronze] = useSound(SFX.TIERS.BRONZE, {
    volume: 0.4,
    soundEnabled: !muted,
  })
  const [sfxSilver] = useSound(SFX.TIERS.SILVER, {
    volume: 0.4,
    soundEnabled: !muted,
  })
  const [sfxGold] = useSound(SFX.TIERS.GOLD, {
    volume: 0.4,
    soundEnabled: !muted,
  })
  const [sfxDiamant] = useSound(SFX.TIERS.DIAMANT, {
    volume: 0.4,
    soundEnabled: !muted,
  })

  useEffect(() => {
    player.updatePoints(myPoints)

    // Correct/wrong answer chime — mirrors the SoloAnswers sound pattern:
    // correct → champions sting (first) or results chime, wrong → boump.
    // playFirstCorrectSound() is itself gated on the mute store.
    if (firstCorrect) {
      playFirstCorrectSound()
    } else if (correct) {
      sfxResults()
    } else if (!poll) {
      sfxWrong()
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
    <section className="glass-3 relative mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center">
      {!poll && (
        // Moment of truth: the verdict icon pops in (overshoot scale) so the
        // correct/wrong reveal lands as a beat. Opacity-only when reduced.
        <motion.div
          key={correct ? "correct" : "wrong"}
          className="w-full"
          variants={reveal.pop()}
          initial="hidden"
          animate="visible"
          transition={reveal.snap}
        >
          {correct ? (
            <CricleCheck className="aspect-square max-h-60 w-full" />
          ) : (
            <CricleXmark className="aspect-square max-h-60 w-full" />
          )}
        </motion.div>
      )}
      <h2 className="mt-1 text-4xl font-bold text-white drop-shadow-lg">
        {t(message)}
      </h2>
      {showRank && (
        <p className="mt-1 text-xl font-bold text-white drop-shadow-lg">
          {t("game:resultTop")}
          {t(rankKey, { rank })}
          {aheadOfMe ? `${t("game:resultBehind")}${aheadOfMe}` : ""}
        </p>
      )}
      {/* W1-D FIX 1: the question is over, so reveal the correct answer on the
          wrong-answer (Too bad) screen. Never shown for poll or correct. */}
      {!poll && !correct && correctAnswer && (
        <p className="mt-2 text-lg font-semibold text-white drop-shadow-lg">
          {t("game:slider.correctAnswer")}: {correctAnswer}
        </p>
      )}
      {!poll && correct && (
        // Points payoff: emphasised pop, delayed a touch behind the verdict so
        // the score reads as the reward beat. Opacity-only when reduced.
        <motion.span
          className="mt-2 rounded-[var(--radius-theme)] bg-black/40 px-4 py-2 text-2xl font-bold text-white tabular-nums drop-shadow-lg"
          variants={reveal.pop(0.7)}
          initial="hidden"
          animate="visible"
          transition={reduced ? reveal.snap : { ...reveal.snap, delay: 0.18 }}
        >
          +{points}
        </motion.span>
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
