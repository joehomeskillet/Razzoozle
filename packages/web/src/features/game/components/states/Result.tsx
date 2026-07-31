import type { CommonStatusDataMap } from "@razzoozle/common/types/game/status"
import { AnswerRevealPanel } from "@razzoozle/web/features/game/components/stage/AnswerRevealPanel"
import CricleCheck from "@razzoozle/web/features/game/components/icons/CricleCheck"
import CricleXmark from "@razzoozle/web/features/game/components/icons/CricleXmark"
import RewardStack from "@razzoozle/web/features/game/components/RewardStack"
import { WordCloudDisplay } from "@razzoozle/web/features/game/components/answers/WordCloudDisplay"
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
    correctOptions,
    correctMatches,
    correctHotspotIndex,
    correctOrder,
    items,
    correctTokenPos,
    playerCount,
    roundRecap,
    textResponses,
  },
}: Props) => {
  const player = usePlayerStore()
  const submittedText = useAnswerStore((s) => s.submittedText)
  const submittedNumber = useAnswerStore((s) => s.submittedNumber)
  const submittedSlotIndices = useAnswerStore((s) => s.submittedSlotIndices)
  const submittedChunks =
    useAnswerStore((s) => s.submittedChunks) ?? EMPTY_CHUNKS
  const muted = useSoundStore((s) => s.muted)
  const { t } = useTranslation()
  const rankKey = rankKeyFor(rank)
  const reveal = useReveal()
  const reduced = reveal.reduced
  const achievementsFired = useRef(false)
  const slotCorrectAnswers =
    correctOptions?.length === submittedChunks.length
      ? correctOptions
      : correctMatches?.length === submittedChunks.length
        ? correctMatches
        : undefined

  // Sequencing: SHOW_RESULT carries item IDs in correctOrder; submittedChunks
  // stores the player's submitted ID order (same store as sentence-builder).
  // Map IDs → labels via items for display; fall back to the raw id.
  const sequencingLabel = (id: string) =>
    items?.find((it) => it.id === id)?.label ?? id

  // Hide points display for players only; managers/presenters always see them
  const showPoints = audience !== "player"

  // W1-D FIX 2: only show the place/rank label when the player actually scored
  // (score > 0) AND it is a real multiplayer game (more than one player).
  // Flower Battle suppresses the per-question rank for players until victory
  // resolves; classic and manager/presenter results keep the existing guard.
  const showRank =
    myPoints > 0 &&
    (playerCount ?? 1) > 1 &&
    !(
      audience === "player" &&
      player.flowerBattlePlayerStatus?.victoryResolved === false
    )

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
    <section
      data-testid="answer-result"
      className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center rounded-[var(--radius-theme)]"
    >

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
      <h2 className="mt-1 text-center text-4xl font-bold text-[color:var(--game-fg)] md:text-5xl lg:text-[clamp(2.5rem,6vh,6rem)]">
        {t(message)}
      </h2>

      {/* client reveal: type-answer slider mathematik fill-blank matching */}
      <div className="mx-auto mb-4 flex max-w-3xl flex-col items-center justify-center gap-2 px-4 text-center">
        {submittedNumber != null && (
          <div className="text-[color:var(--game-fg)] tabular-nums">
            {t("game:reveal.yourValue")} {submittedNumber}
          </div>
        )}
        {submittedText && (
          <div className="text-lg text-[color:var(--game-fg)]">
            {t("game:reveal.yourAnswer")} {submittedText}
          </div>
        )}
      </div>

      {!poll && submittedChunks.length > 0 && slotCorrectAnswers && (
        <motion.div
          className="w-full"
          variants={reveal.pop()}
          initial="hidden"
          animate="visible"
          transition={reveal.snap}
        >
          <div className="mx-auto mb-4 flex max-w-3xl flex-wrap justify-center gap-2 px-4">
            {submittedChunks.map((chunk, idx) => {
              const isCorrect = chunk === slotCorrectAnswers[idx]

              return (
                <span
                  key={`${submittedSlotIndices?.[idx] ?? chunk}-${idx}`}
                  className={clsx(
                    "text-answer-text inline-flex items-center rounded-[var(--radius-theme)] border border-[var(--border-hairline)] px-3 py-2 font-medium",
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
        </motion.div>
      )}

      {/* Reveal (§14.3, unified via AnswerRevealPanel): per-position submitted-vs-
          correct feedback (sentence-builder / wortarten / sequencing) first, then
          the canonical correct-answer panel — tokenPos for wortarten (richer,
          preferred), chips for fill-blank / matching (W1a typed fields; they
          also leak into correctChunks, so they must win BEFORE the legacy
          sentence-builder branch to get their own titles) / sentence-builder /
          sequencing, a text panel for drop-pin, and text as the generic
          wrong-answer fallback (slider/mathematik/… and old servers without
          correctTokenPos). Poll never carries reveal data (`!poll` gate). */}
      {!poll &&
        !slotCorrectAnswers &&
        correctChunks &&
        submittedChunks.length > 0 && (
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
                      "text-answer-text inline-flex items-center rounded-[var(--radius-theme)] border border-[var(--border-hairline)] px-3 py-2 font-medium",
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
      {/* Sequencing: position-by-position ID compare; green/red via design tokens. */}
      {!poll &&
        correctOrder &&
        correctOrder.length > 0 &&
        submittedChunks.length > 0 && (
          <motion.div
            className="w-full"
            variants={reveal.pop()}
            initial="hidden"
            animate="visible"
            transition={reveal.snap}
            aria-label={t("game:sequencing.yourOrder")}
          >
            <div className="mx-auto mb-4 flex max-w-3xl flex-wrap justify-center gap-2 px-4">
              {submittedChunks.map((id, idx) => {
                const isCorrect = id === correctOrder[idx]

                return (
                  <span
                    key={`${id}-${idx}`}
                    className={clsx(
                      "text-answer-text inline-flex items-center gap-2 rounded-[var(--radius-theme)] border border-[var(--border-hairline)] px-3 py-2 font-medium",
                      isCorrect
                        ? "bg-[var(--state-correct)]"
                        : "bg-[var(--state-wrong)]",
                    )}
                  >
                    <span className="tabular-nums opacity-70">{idx + 1}.</span>
                    {sequencingLabel(id)}
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
      ) : !poll && correctOptions && correctOptions.length > 0 ? (
        // W1a fill-blank: one chip per blank slot. Preferred over the legacy
        // correctChunks leak (same labels, wrong sentence-builder title).
        <motion.div
          className="mx-auto mt-[var(--game-space-4)] w-full max-w-3xl px-4"
          variants={reveal.pop()}
          initial="hidden"
          animate="visible"
          transition={reveal.snap}
        >
          <AnswerRevealPanel
            variant="chips"
            title={t("game:fillBlank.correctAnswers")}
            chips={correctOptions}
          />
        </motion.div>
      ) : !poll && correctMatches && correctMatches.length > 0 ? (
        // W1a matching: one chip per left item's correct option (the payload
        // carries option labels only — no left labels to pair for tokenPos).
        <motion.div
          className="mx-auto mt-[var(--game-space-4)] w-full max-w-3xl px-4"
          variants={reveal.pop()}
          initial="hidden"
          animate="visible"
          transition={reveal.snap}
        >
          <AnswerRevealPanel
            variant="chips"
            title={t("game:matching.correctMatches")}
            chips={correctMatches}
          />
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
      ) : !poll && correctOrder && correctOrder.length > 0 ? (
        <motion.div
          className="mx-auto mt-[var(--game-space-4)] w-full max-w-3xl px-4"
          variants={reveal.pop()}
          initial="hidden"
          animate="visible"
          transition={reveal.snap}
        >
          <AnswerRevealPanel
            variant="chips"
            title={t("game:sequencing.correctOrder")}
            chips={correctOrder.map(sequencingLabel)}
          />
        </motion.div>
      ) : !poll && correctHotspotIndex != null ? (
        // W1a drop-pin: text reveal of the correct zone whenever the index is
        // present (even on a correct answer) so presenter + player both see the
        // solution. correctAnswer carries the server's zone label; the index is
        // only a fallback. No media/hotspot overlay here — separate WP.
        <motion.div
          className="mx-auto mt-[var(--game-space-4)] w-full max-w-3xl px-4"
          variants={reveal.pop()}
          initial="hidden"
          animate="visible"
          transition={reveal.snap}
        >
          <AnswerRevealPanel
            variant="text"
            title={t("game:dropPin.correctLocation")}
            text={correctAnswer ?? `#${correctHotspotIndex + 1}`}
          />
        </motion.div>
      ) : (
        // W1-D FIX 1: the question is over, so reveal the correct answer on the
        // wrong-answer (Too bad) screen. Never shown for poll or correct.
        // Covers choice, boolean, multiple-select (no per-type reveal branch).
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
          className="text-answer-text mt-2 rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-white px-4 py-2 text-2xl font-bold tabular-nums md:text-4xl lg:text-[clamp(1.75rem,4vh,3.5rem)]"
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
      {textResponses && Object.keys(textResponses).length > 0 && (
        <div className="mx-auto mt-[var(--game-space-4)] w-full max-w-3xl px-4">
          <WordCloudDisplay
            words={Object.entries(textResponses).map(([text, count]) => ({
              text,
              count,
            }))}
            disabled={true}
          />
        </div>
      )}
      {showRoundRecap && <RoundRecapStrip awards={roundRecap ?? []} />}
    </section>
  )
}

export default Result
