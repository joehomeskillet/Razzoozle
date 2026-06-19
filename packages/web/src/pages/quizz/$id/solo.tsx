/**
 * /quizz/:id/solo — offline solo play route.
 *
 * Self-contained: no socket, no multiplayer stores.
 * Uses the useSoloStore (zustand) for the state machine.
 *
 * Phases:
 *   idle / loading → name → question → answering → result → (loop) → finished
 *
 * REST endpoints used (all relative, nginx proxies to socket server):
 *   GET  /api/quizz/:id/solo
 *   POST /api/quizz/:id/check-answer
 *   POST /api/quizz/:id/solo-score
 */
import React from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import AnimatedPoints from "@razzoozle/web/features/game/components/AnimatedPoints"
import ScoreToast from "@razzoozle/web/features/game/components/ScoreToast"
import SoloAnswers from "@razzoozle/web/features/game/components/states/SoloAnswers"
import SoloLeaderboard from "@razzoozle/web/features/game/components/SoloLeaderboard"
import { useSoloStore } from "@razzoozle/web/features/game/stores/solo"
import Question from "@razzoozle/web/features/game/components/states/Question"
import { usePlayerStore } from "@razzoozle/web/features/game/stores/player"
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import Loader from "@razzoozle/web/components/Loader"

// ---------------------------------------------------------------------------
// Minimal solo shell — replaces GameWrapper to avoid socket coupling
// ---------------------------------------------------------------------------

interface SoloShellProps {
  children: React.ReactNode
  questionCurrent?: number
  questionTotal?: number
  playerName: string
  totalPoints: number
  /**
   * Key for the AnimatePresence transition around the content slot. Keyed on
   * the question index (NOT the phase) so SoloAnswers stays mounted across the
   * answering→result transition — remounting it would restart its countdown
   * and answer-music lifecycle.
   */
  phaseKey: number
  // Optional action rendered in the bottom bar next to the score — e.g. the
  // result-phase "next question" button, so it is always reachable without
  // scrolling and never crowds the answer content.
  footerAction?: React.ReactNode
}

const SoloShell = ({
  children,
  questionCurrent,
  questionTotal,
  playerName,
  totalPoints,
  phaseKey,
  footerAction,
}: SoloShellProps) => {
  const reduced = useReducedMotion() ?? false

  return (
    <section
      className="relative flex h-dvh overflow-hidden"
      style={{ "--game-fg": "#0E1120" } as React.CSSProperties}
    >
      <div className="z-10 flex w-full flex-1 flex-col justify-between">
        {/* Top bar: question counter */}
        <div className="flex w-full items-center justify-between gap-2 p-4">
          <div className="flex shrink-0 justify-start">
            {questionCurrent != null && questionTotal != null && (
              <motion.div
                key={questionCurrent}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="flex min-h-11 items-center rounded-lg border border-[var(--border-hairline)] bg-white px-4 text-lg font-bold text-[color:var(--color-field-ink)] shadow-sm"
              >
                {`${questionCurrent} / ${questionTotal}`}
              </motion.div>
            )}
          </div>
          <div className="shrink-0 rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-[color:var(--color-field-ink)]/70">
            Solo
          </div>
        </div>

        {/* Content */}
        <div className="flex min-h-0 flex-1 flex-col justify-center overflow-hidden px-4 pt-2 pb-3">
          <AnimatePresence mode="wait">
            <motion.div
              key={phaseKey}
              className="flex min-h-0 flex-1 flex-col justify-center overflow-hidden"
              initial={
                reduced ? { opacity: 0 } : { opacity: 0, y: 20 }
              }
              animate={
                reduced ? { opacity: 1 } : { opacity: 1, y: 0 }
              }
              exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Bottom bar: player name + (optional next action) + points */}
        <div className="z-50 flex items-center justify-between gap-3 border-t border-[var(--border-hairline)] bg-white px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-lg font-bold text-[color:var(--color-field-ink)]">
          <p className="min-w-0 truncate text-gray-800">{playerName}</p>
          <div className="flex shrink-0 items-center gap-3">
            {footerAction}
            <div className="rounded-lg bg-gray-800 px-3 py-1 text-lg tabular-nums text-white">
              {totalPoints}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Name entry screen
// ---------------------------------------------------------------------------

interface NameScreenProps {
  subject: string
  onStart: (name: string) => void
}

const NameScreen = ({ subject, onStart }: NameScreenProps) => {
  const [name, setName] = useState("")
  const { t } = useTranslation()
  const reduced = useReducedMotion() ?? false

  return (
    <section className="relative flex min-h-dvh flex-col items-center justify-center">
      <motion.div
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24 }}
        animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
        transition={
          reduced
            ? { duration: 0.3 }
            : { type: "spring", stiffness: 300, damping: 30 }
        }
        className="relative z-10 mx-auto w-full max-w-md rounded-3xl border border-[var(--border-hairline)] bg-white p-10 shadow-lg"
      >
        <h1 className="mb-2 text-center text-4xl font-bold text-[color:var(--color-field-ink)]">
          {subject}
        </h1>
        <p className="mb-6 text-center text-lg text-[color:var(--color-field-ink)]/70">
          {t("game:solo.play")}
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            onStart(name.trim() || "Anonym")
          }}
          className="flex flex-col gap-4"
        >
          <input
            type="text"
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("game:solo.enterName")}
            autoFocus
            autoComplete="off"
            className="w-full bg-gray-50 border-2 border-[var(--border-hairline)] text-[color:var(--color-field-ink)] placeholder-gray-500 focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/30 transition-all duration-300 rounded-2xl px-6 py-4 text-2xl text-center font-bold outline-none"
          />
          <button
            type="submit"
            className="bg-gradient-to-r from-primary to-purple-500 hover:brightness-110 shadow-lg shadow-primary/40 hover:scale-105 active:scale-95 transition-all rounded-2xl px-8 py-4 text-2xl font-black text-white"
          >
            {t("game:startGame")}
          </button>
        </form>
      </motion.div>
    </section>
  )
}

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
    <section className="relative flex min-h-dvh flex-col">
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
          <div className="mt-3 inline-block rounded-2xl border border-[var(--border-hairline)] bg-white px-8 py-3 shadow-sm">
            <AnimatedPoints
              to={totalPoints}
              className="text-6xl font-black tabular-nums text-yellow-500"
            />
            <span className="ml-2 text-lg text-[color:var(--color-field-ink)]/60">
              pts
            </span>
          </div>
        </motion.div>

        <SoloLeaderboard
          leaderboard={leaderboard}
          playerName={playerName}
          totalPoints={totalPoints}
        />

        <div className="flex flex-col gap-3 pb-10 sm:flex-row">
          <button
            type="button"
            onClick={onReplay}
            className="bg-gradient-to-r from-primary to-purple-500 shadow-lg shadow-primary/40 rounded-full px-10 py-3 text-xl font-bold text-white hover:brightness-110 active:scale-95 transition-all"
          >
            {t("game:solo.replay")}
          </button>
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

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

const SoloPlayPage = () => {
  const { id } = useParams({ from: "/quizz/$id/solo" })
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { updatePoints } = usePlayerStore()
  const reduced = useReducedMotion() ?? false

  const {
    phase,
    questions,
    currentIndex,
    subject,
    playerName,
    totalPoints,
    leaderboard,
    lastResult,
    error,
    loadQuiz,
    setPlayerName,
    startGame,
    nextQuestion,
    autoAdvance,
    toggleAutoAdvance,
    finishGame,
    reset,
  } = useSoloStore()

  // Track if finishGame has been called to avoid double-submit.
  const finishedRef = useRef(false)

  // Load quiz on mount / when id changes.
  useEffect(() => {
    void loadQuiz(id)
    return () => {
      reset()
    }
    // oxlint-disable-next-line
  }, [id])

  // When phase transitions to "finished", POST the score once.
  useEffect(() => {
    if (phase === "finished" && !finishedRef.current) {
      finishedRef.current = true
      void finishGame(id)
    }
    // oxlint-disable-next-line
  }, [phase])

  // Keep the player store's point counter in sync for the bottom bar reference.
  useEffect(() => {
    updatePoints(totalPoints)
  }, [totalPoints, updatePoints])

  // ---- Error state ----
  if (error) {
    return (
      <section className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-black px-6 text-center">
        <p className="text-2xl font-bold text-white">{error}</p>
        <button
          type="button"
          onClick={() => navigate({ to: "/" })}
          className="mt-4 rounded-xl bg-white px-6 py-3 font-bold text-black"
        >
          {t("common:exit")}
        </button>
      </section>
    )
  }

  // ---- Loading ----
  if (phase === "idle" || phase === "loading") {
    return (
      <section className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-black">
        <Loader className="h-20" />
        <p className="text-xl font-bold text-white">{t("common:connecting")}</p>
      </section>
    )
  }

  // ---- Name entry ----
  if (phase === "name") {
    return (
      <NameScreen
        subject={subject}
        onStart={(name) => {
          setPlayerName(name.trim() || "Anonym")
          startGame()
        }}
      />
    )
  }

  // ---- Finished ----
  if (phase === "finished") {
    return (
      <FinishedScreen
        subject={subject}
        totalPoints={totalPoints}
        leaderboard={leaderboard}
        playerName={playerName}
        onReplay={() => {
          finishedRef.current = false
          void loadQuiz(id)
        }}
      />
    )
  }

  const currentQuestion = questions.at(currentIndex)

  if (!currentQuestion) {
    return null
  }

  // ---- Question / answering / result phases ----
  // question → show Question component (cooldown display)
  // answering/result → show SoloAnswers (answers + inline result feedback)

  // Synthesize a SHOW_QUESTION payload for the existing Question component.
  const questionData: import("@razzoozle/common/types/game/status").CommonStatusDataMap["SHOW_QUESTION"] =
    {
      question: currentQuestion.question,
      media: currentQuestion.media,
      cooldown: currentQuestion.cooldown,
      submittedBy: currentQuestion.submittedBy,
    }

  return (
    <>
      <SoloShell
        questionCurrent={currentIndex + 1}
        questionTotal={questions.length}
        playerName={playerName}
        totalPoints={totalPoints}
        phaseKey={currentIndex}
        footerAction={
          phase === "result" ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-pressed={autoAdvance}
                aria-label={t("game:solo.autoNextTitle", {
                  defaultValue: "Automatisch zur nächsten Frage",
                })}
                onClick={toggleAutoAdvance}
                title={t("game:solo.autoNextTitle", {
                  defaultValue: "Automatisch zur nächsten Frage",
                })}
                className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100"
              >
                <span
                  className={
                    "relative h-5 w-9 rounded-full transition-colors " +
                    (autoAdvance ? "bg-primary" : "bg-gray-300")
                  }
                >
                  <span
                    className={
                      "absolute top-0.5 size-4 rounded-full bg-white transition-[left] " +
                      (autoAdvance ? "left-[18px]" : "left-0.5")
                    }
                  />
                </span>
                <span className="hidden sm:inline">
                  {t("game:solo.autoNext", { defaultValue: "Auto-Weiter" })}{" "}
                  {autoAdvance
                    ? t("game:controls.autoOn", { defaultValue: "an" })
                    : t("game:controls.autoOff", { defaultValue: "aus" })}
                </span>
              </button>
              <motion.button
                type="button"
                onClick={nextQuestion}
                animate={reduced ? undefined : { scale: [1, 1.05, 1] }}
                transition={
                  reduced
                    ? undefined
                    : { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
                }
                className="rounded-lg bg-gradient-to-r from-primary to-purple-500 px-5 py-2 text-base font-bold text-white shadow-md shadow-primary/30 transition-all hover:brightness-110 active:scale-95"
              >
                {currentIndex + 1 < questions.length
                  ? t("game:solo.next")
                  : t("game:solo.finish")}
              </motion.button>
            </div>
          ) : undefined
        }
      >
        {phase === "question" && (
          <div className="flex flex-1 flex-col">
            <Question data={questionData} />
            {/* After cooldown the state machine moves to "answering" via SoloAnswers
                mounted below once the question phase auto-transitions — but we
                need the user to see the question first. We auto-advance after the
                cooldown animation completes (cooldown seconds). */}
            <SoloAutoAdvance cooldown={currentQuestion.cooldown} />
          </div>
        )}

        {(phase === "answering" || phase === "result") && (
          <SoloAnswers quizzId={id} question={currentQuestion} />
        )}

        {/* RESULT auto-advance: mounts only while the player has auto-advance ON,
            so toggling it off unmounts this and cancels the pending advance. */}
        {phase === "result" && autoAdvance && <SoloResultAutoAdvance />}
      </SoloShell>

      {/* Top-center result toast. Rendered at the page level (sibling of
          SoloShell, portals to document.body) so SoloPlayPage stays mounted
          across question changes — letting the toast's AnimatePresence EXIT
          (slide-up) finally play when advancing to the next question. */}
      <ScoreToast
        correct={lastResult?.correct ?? false}
        points={lastResult?.points ?? 0}
        visible={phase === "result" && lastResult !== null}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Helper: auto-advance from "question" phase to "answering" after cooldown
// ---------------------------------------------------------------------------

interface SoloAutoAdvanceProps {
  cooldown: number
}

const SoloAutoAdvance = ({ cooldown }: SoloAutoAdvanceProps) => {
  useEffect(() => {
    // Transition from "question" display to "answering" (showing answer buttons)
    // after the cooldown animation finishes.
    const id = setTimeout(() => {
      useSoloStore.setState({ phase: "answering" })
    }, cooldown * 1000)

    return () => clearTimeout(id)
    // oxlint-disable-next-line
  }, [cooldown])

  return null
}

// ---------------------------------------------------------------------------
// Helper: auto-advance from "result" phase to the next question / finished
// ---------------------------------------------------------------------------

const AUTO_NEXT_MS = 5000

const SoloResultAutoAdvance = () => {
  useEffect(() => {
    // Advance to the next question (or the finished screen on the last one)
    // after a short linger on the result. Unmounting (toggle off / phase
    // change / manual Next) clears the pending timeout.
    const id = setTimeout(() => {
      useSoloStore.getState().nextQuestion()
    }, AUTO_NEXT_MS)

    return () => clearTimeout(id)
  }, [])

  return null
}

// ---------------------------------------------------------------------------
// Route definition (TanStack file-based router — route.gen.ts auto-updates on build)
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/quizz/$id/solo")({
  component: SoloPlayPage,
})
