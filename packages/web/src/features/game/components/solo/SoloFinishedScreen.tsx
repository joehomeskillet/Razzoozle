import { motion, useReducedMotion } from "motion/react"
import { useTranslation } from "react-i18next"
import Button from "@razzoozle/web/components/Button"
import AnimatedPoints from "@razzoozle/web/features/game/components/AnimatedPoints"
import SoloLeaderboard from "@razzoozle/web/features/game/components/SoloLeaderboard"
import type { SoloQuestionResult } from "@razzoozle/web/features/game/stores/solo"

// ---------------------------------------------------------------------------
// Finished / result screen after all questions
// ---------------------------------------------------------------------------

interface FinishedScreenProps {
  subject: string
  totalPoints: number
  leaderboard: import("@razzoozle/common/types/game").SoloScoreEntry[]
  playerName: string
  onReplay: () => void
  // Optional answer trail from the solo store — powers the personal recap
  // card below. Undefined/empty just skips the card (no data, no crash).
  answers?: SoloQuestionResult[]
}

// Personal recap for a solo round, parity with PlayerFinished's MyRecapCard
// minus the `fastest` stat — solo tracks no per-answer timing, so there is
// nothing to report there (not a gap, just no such measurement in solo).
const SoloRecapCard = ({ answers }: { answers: SoloQuestionResult[] }) => {
  const { t } = useTranslation()

  const correct = answers.filter((a) => a.correct).length
  const wrong = answers.length - correct
  const accuracyPct =
    answers.length > 0 ? Math.round((correct / answers.length) * 100) : 0

  let peakStreak = 0
  let streak = 0
  for (const a of answers) {
    streak = a.correct ? streak + 1 : 0
    peakStreak = Math.max(peakStreak, streak)
  }

  const stats: { label: string; value: string }[] = [
    { label: t("game:recap.myCard.accuracy"), value: `${accuracyPct}%` },
    { label: t("game:recap.myCard.correct"), value: `${correct}` },
    { label: t("game:recap.myCard.wrong"), value: `${wrong}` },
    {
      label: t("game:recap.myCard.peakStreak"),
      value: t("game:recap.myCard.streakValue", { count: peakStreak }),
    },
  ]

  return (
    <div data-testid="solo-finished-recap" className="w-full max-w-md">
      <h2 className="mb-3 text-center text-xl font-extrabold text-[color:var(--game-fg)] drop-shadow">
        {t("game:recap.title")}
      </h2>
      <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex flex-col items-center gap-0.5 rounded-2xl border border-[var(--border-hairline)] bg-white px-3 py-3 text-center shadow-sm"
          >
            <span className="text-2xl font-extrabold text-[color:var(--color-field-ink)] tabular-nums">
              {s.value}
            </span>
            <span className="text-xs font-semibold tracking-wide text-[color:var(--color-field-ink)]/60 uppercase">
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

const FinishedScreen = ({
  subject,
  totalPoints,
  leaderboard,
  playerName,
  onReplay,
  answers,
}: FinishedScreenProps) => {
  const { t } = useTranslation()
  const reduced = useReducedMotion() ?? false

  return (
    <section className="relative flex min-h-dvh flex-col" style={{ "--game-fg": "#0E1120" } as React.CSSProperties}>
      <div className="relative z-10 flex flex-1 flex-col items-center justify-start gap-6 overflow-y-auto px-4 py-10">
        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }}
          transition={
            reduced
              ? { duration: 0.3 }
              : { type: "spring", stiffness: 300, damping: 25 }
          }
          className="text-center"
        >
          <h1 className="text-4xl font-bold text-[color:var(--color-field-ink)]">
            {subject}
          </h1>
          <p className="mt-2 text-2xl font-bold text-[color:var(--color-field-ink)]/80">
            {t("game:solo.yourScore")}
          </p>
          <div data-testid="solo-finished-score" className="mt-3 inline-block rounded-2xl border border-[var(--border-hairline)] bg-white px-8 py-3 shadow-sm">
            <AnimatedPoints
              to={totalPoints}
              className="text-6xl font-black tabular-nums text-[var(--game-fg)]"
            />
            <span className="ml-2 text-lg text-[color:var(--color-field-ink)]/60">
              pts
            </span>
          </div>
        </motion.div>

        <div data-testid="solo-finished-leaderboard">
          <SoloLeaderboard
            leaderboard={leaderboard}
            playerName={playerName}
            totalPoints={totalPoints}
          />
        </div>

        {answers && answers.length > 0 && <SoloRecapCard answers={answers} />}

        <div className="flex flex-col gap-3 pb-10 sm:flex-row">
          <Button
            data-testid="solo-finished-restart"
            type="button"
            onClick={onReplay}
            variant="primary"
            size="lg"
          >
            {t("game:solo.replay")}
          </Button>
          <a
            href="/trophies"
            className="flex items-center justify-center rounded-full border border-[var(--border-hairline)] bg-white px-10 py-3 text-xl font-bold text-[color:var(--color-field-ink)] transition-colors hover:bg-gray-50"
          >
            {t("game:solo.trophies")}
          </a>
          <a
            href="/"
            className="flex items-center justify-center rounded-full border border-[var(--border-hairline)] bg-white px-10 py-3 text-xl font-bold text-[color:var(--color-field-ink)] transition-colors hover:bg-gray-50"
          >
            {t("common:exit")}
          </a>
        </div>
      </div>
    </section>
  )
}

export default FinishedScreen
