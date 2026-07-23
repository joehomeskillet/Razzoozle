import type { CommonStatusDataMap } from "@razzoozle/common/types/game/status"
import { AnswerRevealPanel } from "@razzoozle/web/features/game/components/stage/AnswerRevealPanel"
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
  audience?: "player" | "manager"
  data: CommonStatusDataMap["SHOW_RESULT"]
}

// Stable empty fallback. Selecting `s.submittedChunks ?? []` INSIDE the Zustand
// selector returns a brand-new [] every call when submittedChunks is undefined
// (every non-sentence-builder question), so Zustand's referential-equality check
// always sees "changed" → re-render → re-select → infinite loop (React #185).
// Default OUTSIDE the selector against a stable reference instead.
const EMPTY_CHUNKS: string[] = []

const Result = ({
  audience,
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
    correctTokenPos,
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

  // Hide points display for players only; managers/presenters always see them
  const showPoints = audience !== "player"

  // W1-D FIX 2: only show the place/rank label when the player actually scored
  // (score > 0) AND it is a real multiplayer game (more than one player).
  // Otherwise a hollow "1st place" would appear at 0 points or in a solo game.
  const showRank = myPoints > 0 && (playerCount ?? 1) > 1

  // Hide round recap for players; only managers/presenters see the highlights
  const showRoundRecap = audience !== "player"

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
    <section data-testid="answer-result" className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center rounded-[var(--radius-theme)]">
      {!poll && (
        // Moment of truth: the verdict icon pops in (overshoot scale) so the
        // correct/wrong reveal lands as a beat. Opacity-only when reduced.
        <motion.div
          data-testid={correct ? "correct-answer-highlight" : undefined}
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
      <h2 className="mt-1 text-4xl md:text-5xl lg:text-[clamp(2.5rem,6vh,6rem)] font-bold text-[color:var(--game-fg)] text-center">
        {t(message)}
      </h2>

      {/* Reveal (§14.3, unified via AnswerRevealPanel): per-chunk submitted-vs-
          correct feedback (sentence-builder / wortarten) first, then the
          canonical correct-answer panel — tokenPos for wortarten (richer,
          preferred), chips for sentence-builder, text as the generic
          fallback (slider/mathematik/… and old servers without
          correctTokenPos). Poll never carries reveal data (`!poll` gate). */}
      {!poll && correctChunks && submittedChunks.length > 0 && (
        <motion.div
          className="w-full"
          variants={reveal.pop()}
          initial="hidden"
          animate="visible"
          transition={reveal.snap}
        >
          <div className="mx-auto mb-4 flex max-w-3xl flex-wrap justify-center gap-2 px-4">
            {submittedChunks.map((chunk, idx) => {
              const isDisabled = correctChunks[idx] === ""
              const isCorrect = !isDisabled && chunk === correctChunks[idx]

              return (
                <span
                  key={`${chunk}-${idx}`}
                  className={clsx(
                    "inline-flex items-center rounded-[var(--radius-theme)] border border-[var(--border-hairline)] px-3 py-2 font-medium text-[var(--answer-text)]",
                    isDisabled
                      ? "bg-[var(--tier-silver)]"
                      : isCorrect
                      ? "bg-[var(--state-correct)]"
                      : "bg-[var(--state-wrong)]",
                  )}
                >
                  {chunk}
                </span>
              )
            })}
          </div>
        </motion.div>
      )}
      {!poll && correctTokenPos && correctTokenPos.length > 0 ? (
        <motion.div
          className="mx-auto mt-[var(--game-space-4)] w-full max-w-3xl px-4"
          variants={reveal.pop()}
          initial="hidden"
          animate="visible"
          transition={reveal.snap}
        >
          <AnswerRevealPanel variant="tokenPos" tokenPos={correctTokenPos} />
        </motion.div>
      ) : !poll && correctChunks ? (
        <motion.div
          className="mx-auto mt-[var(--game-space-4)] w-full max-w-3xl px-4"
          variants={reveal.pop()}
          initial="hidden"
          animate="visible"
          transition={reveal.snap}
        >
          <AnswerRevealPanel
            variant="chips"
            title={t("game:sentenceBuilder.correctSentence")}
            chips={correctChunks.filter((c) => c !== "")}
          />
        </motion.div>
      ) : (
        // W1-D FIX 1: the question is over, so reveal the correct answer on the
        // wrong-answer (Too bad) screen. Never shown for poll or correct.
        !poll &&
        !correct &&
        correctAnswer && (
          <motion.div
            className="mx-auto mt-[var(--game-space-4)] w-full max-w-3xl px-4"
            variants={reveal.pop()}
            initial="hidden"
            animate="visible"
            transition={reveal.snap}
          >
            <AnswerRevealPanel variant="text" text={correctAnswer} />
          </motion.div>
        )
      )}

      {showRank && (
        <p className="mt-1 text-xl font-bold text-[color:var(--game-fg)]">
          {t("game:resultTop")}
          {t(rankKey, { rank })}
          {aheadOfMe ? `${t("game:resultBehind")}${aheadOfMe}` : ""}
        </p>
      )}
      {showPoints && !poll && correct && (
        // Points payoff: emphasised pop, delayed a touch behind the verdict so
        // the score reads as the reward beat. Opacity-only when reduced.
        <motion.span
          className="mt-2 rounded-[var(--radius-theme)] bg-white border border-[var(--border-hairline)] px-4 py-2 text-2xl md:text-4xl lg:text-[clamp(1.75rem,4vh,3.5rem)] font-bold text-[var(--answer-text)] tabular-nums"
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
      {showRoundRecap && <RoundRecapStrip awards={roundRecap ?? []} />}
    </section>
  )
}

export default Result
