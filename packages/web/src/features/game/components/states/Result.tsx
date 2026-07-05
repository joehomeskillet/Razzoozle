import type { CommonStatusDataMap } from "@razzoozle/common/types/game/status"
import Markdown from "@razzoozle/web/components/Markdown"
import CricleCheck from "@razzoozle/web/features/game/components/icons/CricleCheck"
import CricleXmark from "@razzoozle/web/features/game/components/icons/CricleXmark"
import RewardStack from "@razzoozle/web/features/game/components/RewardStack"
import RoundRecapStrip from "@razzoozle/web/features/game/recap/RoundRecapStrip"
import { useAnswerStore } from "@razzoozle/web/features/game/stores/answer"
import { usePlayerStore } from "@razzoozle/web/features/game/stores/player"
import { useSoundStore } from "@razzoozle/web/features/game/stores/sound"
import { useSoundUrl } from "@razzoozle/web/features/game/utils/sfx"
import { playFirstCorrectSound } from "@razzoozle/web/features/game/utils/firstCorrectSound"
import {
  hapticAchievement,
  hapticError,
  hapticSuccess,
  hapticWin,
} from "@razzoozle/web/features/game/utils/haptics"
import { rankKeyFor } from "@razzoozle/web/features/game/utils/rank"
import {
  ACHIEVEMENT_META,
  highestTier,
} from "@razzoozle/web/features/game/utils/achievements"
import { persistAchievements } from "@razzoozle/web/features/game/utils/achievementsStore"
import { fireTierConfetti } from "@razzoozle/web/features/game/utils/confetti"
import { useReveal } from "@razzoozle/web/features/game/animation/presets"
import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import useSound from "use-sound"
import { motion } from "motion/react"
import clsx from "clsx"

interface Props {
  data: CommonStatusDataMap["SHOW_RESULT"]
}

// Stable empty fallback. Selecting `s.submittedChunks ?? []` INSIDE the Zustand
// selector returns a brand-new [] every call when submittedChunks is undefined
// (every non-sentence-builder question), so Zustand's referential-equality check
// always sees "changed" → re-render → re-select → infinite loop (React #185).
// Default OUTSIDE the selector against a stable reference instead.
const EMPTY_CHUNKS: string[] = []

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
    correctChunks,
    playerCount,
    roundRecap,
  },
}: Props) => {
  const player = usePlayerStore()
  const submittedChunks = useAnswerStore((s) => s.submittedChunks) ?? EMPTY_CHUNKS
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

  const resultsUrl = useSoundUrl("results")
  const boumpUrl = useSoundUrl("boump")
  const bronzeUrl = useSoundUrl("tierBronze")
  const silverUrl = useSoundUrl("tierSilver")
  const goldUrl = useSoundUrl("tierGold")
  const diamantUrl = useSoundUrl("tierDiamant")
  const [sfxResults] = useSound(resultsUrl, {
    volume: 0.2,
    soundEnabled: !muted,
  })
  // Wrong-answer chime — reuse the existing boump asset (mirrors SoloAnswers).
  const [sfxWrong] = useSound(boumpUrl, {
    volume: 0.3,
    soundEnabled: !muted,
  })
  const [sfxBronze] = useSound(bronzeUrl, {
    volume: 0.4,
    soundEnabled: !muted,
  })
  const [sfxSilver] = useSound(silverUrl, {
    volume: 0.4,
    soundEnabled: !muted,
  })
  const [sfxGold] = useSound(goldUrl, {
    volume: 0.4,
    soundEnabled: !muted,
  })
  const [sfxDiamant] = useSound(diamantUrl, {
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
      hapticWin()
    } else if (correct) {
      sfxResults()
      hapticSuccess()
    } else if (!poll) {
      sfxWrong()
      hapticError()
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

    if (top === "diamant") {
      sfxDiamant()
      hapticAchievement("diamant")
    } else if (top === "gold") {
      sfxGold()
      hapticAchievement("gold")
    } else if (top === "silver") {
      sfxSilver()
      hapticAchievement("silver")
    } else if (top === "bronze") {
      sfxBronze()
      hapticAchievement("bronze")
    }

    // Small delay so the popup animation starts first
    const timer = setTimeout(() => {
      fireTierConfetti(ids, reduced)
    }, 300)

    return () => clearTimeout(timer)
    // oxlint-disable-next-line
  }, [])

  const unlockedIds = achievements ?? []

  return (
    <section className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center rounded-[var(--radius-theme)]">
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
      {!poll && correctChunks && (
        <motion.div
          className="w-full"
          variants={reveal.pop()}
          initial="hidden"
          animate="visible"
          transition={reveal.snap}
        >
          {submittedChunks.length > 0 ? (
            <div className="mx-auto mb-4 flex max-w-3xl flex-wrap justify-center gap-2 px-4">
              {submittedChunks.map((chunk, idx) => {
                const isCorrect = chunk === correctChunks[idx]

                return (
                  <span
                    key={`${chunk}-${idx}`}
                    className={clsx(
                      "inline-flex items-center rounded-[var(--radius-theme)] border border-[var(--border-hairline)] px-3 py-2 font-medium text-[var(--answer-text)]",
                      isCorrect
                        ? "bg-[var(--state-correct)]"
                        : "bg-[var(--state-wrong)]",
                    )}
                  >
                    {chunk}
                  </span>
                )
              })}
            </div>
          ) : null}

          <div className="mx-auto mb-4 max-w-3xl rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-white p-4 text-center shadow-[var(--shadow-flat)]">
            <p className="mb-2 text-sm font-semibold text-[color:var(--game-fg)]">
              {t("game:sentenceBuilder.correctSentence", {
                defaultValue: "Correct answer",
              })}
            </p>
            <p className="text-lg font-bold text-[color:var(--game-fg)]">
              {correctChunks.join(" ")}
            </p>
          </div>
        </motion.div>
      )}
      <h2 className="mt-1 text-4xl font-bold text-[color:var(--game-fg)]">
        {t(message)}
      </h2>
      {showRank && (
        <p className="mt-1 text-xl font-bold text-[color:var(--game-fg)]">
          {t("game:resultTop")}
          {t(rankKey, { rank })}
          {aheadOfMe ? `${t("game:resultBehind")}${aheadOfMe}` : ""}
        </p>
      )}
      {/* W1-D FIX 1: the question is over, so reveal the correct answer on the
          wrong-answer (Too bad) screen. Never shown for poll or correct. */}
      {!poll && !correct && correctAnswer && (
        <p className="mt-2 text-lg font-semibold text-[color:var(--game-fg)]">
          {t("game:slider.correctAnswer")}: <Markdown>{correctAnswer}</Markdown>
        </p>
      )}
      {!poll && correct && (
        // Points payoff: emphasised pop, delayed a touch behind the verdict so
        // the score reads as the reward beat. Opacity-only when reduced.
        <motion.span
          className="mt-2 rounded-[var(--radius-theme)] bg-[color:var(--color-field-ink)] px-4 py-2 text-2xl font-bold text-white tabular-nums"
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
      <RoundRecapStrip awards={roundRecap ?? []} />
    </section>
  )
}

export default Result
