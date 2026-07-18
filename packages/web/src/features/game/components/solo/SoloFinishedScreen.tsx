import { motion, useReducedMotion } from "motion/react"
import { useTranslation } from "react-i18next"
import Button from "@razzoozle/web/components/Button"
import AnimatedPoints from "@razzoozle/web/features/game/components/AnimatedPoints"
import SoloLeaderboard from "@razzoozle/web/features/game/components/SoloLeaderboard"

// ---------------------------------------------------------------------------
// Finished / result screen after all questions
// ---------------------------------------------------------------------------

interface FinishedScreenProps {
  subject: string
  totalPoints: number
  leaderboard: import("@razzoozle/common/types/game").SoloScoreEntry[]
  playerName: string
  onReplay: () => void
}

const FinishedScreen = ({
  subject,
  totalPoints,
  leaderboard,
  playerName,
  onReplay,
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
