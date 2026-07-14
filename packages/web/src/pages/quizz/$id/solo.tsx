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
import ScoreToast from "@razzoozle/web/features/game/components/ScoreToast"
import SoloRewardToast from "@razzoozle/web/features/game/components/SoloRewardToast"
import SoloAnswers from "@razzoozle/web/features/game/components/states/SoloAnswers"
import { useSoloStore } from "@razzoozle/web/features/game/stores/solo"
import Question from "@razzoozle/web/features/game/components/states/Question"
import { usePlayerStore } from "@razzoozle/web/features/game/stores/player"
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router"
import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import Loader from "@razzoozle/web/components/Loader"
import SoloShell from "@razzoozle/web/features/game/components/solo/SoloShell"
import NameScreen from "@razzoozle/web/features/game/components/solo/SoloNameScreen"
import FinishedScreen from "@razzoozle/web/features/game/components/solo/SoloFinishedScreen"
import SoloFooterControls from "@razzoozle/web/features/game/components/solo/SoloFooterControls"
import {
  SoloAutoAdvance,
  SoloResultAutoAdvance,
} from "@razzoozle/web/features/game/components/solo/SoloAutoAdvance"

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

const SoloPlayPage = () => {
  const { id } = useParams({ from: "/quizz/$id/solo" })
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { updatePoints } = usePlayerStore()

  const {
    phase,
    questions,
    currentIndex,
    subject,
    playerName,
    totalPoints,
    leaderboard,
    lastResult,
    lastAchievements,
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
      <section className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[var(--color-field-cream)] px-6 text-center">
        <p className="text-2xl font-bold text-[color:var(--color-field-ink)]">{error}</p>
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
      <section className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[var(--color-field-cream)]">
        <Loader className="h-20" />
        <p className="text-xl font-bold text-[color:var(--color-field-ink)]">{t("common:connecting")}</p>
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
        variant="solo"
        footerAction={
          phase === "result" ? (
            <SoloFooterControls
              autoAdvance={autoAdvance}
              toggleAutoAdvance={toggleAutoAdvance}
              nextQuestion={nextQuestion}
              currentIndex={currentIndex}
              questions={questions}
            />
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

      <SoloRewardToast
        achievementIds={lastAchievements}
        visible={phase === "result" && lastResult !== null}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Route definition (TanStack file-based router — route.gen.ts auto-updates on build)
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/quizz/$id/solo")({
  component: SoloPlayPage,
})
