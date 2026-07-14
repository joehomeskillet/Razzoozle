/**
 * /quizz/:id/assignment/:assignmentId — player assignment play route.
 *
 * Validates the assignment deadline, then mounts the existing Solo play flow
 * passing assignmentId through to score submission.
 */
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { motion } from "motion/react"
import Loader from "@razzoozle/web/components/Loader"
import { useSoloStore } from "@razzoozle/web/features/game/stores/solo"
import { usePlayerStore } from "@razzoozle/web/features/game/stores/player"
import ScoreToast from "@razzoozle/web/features/game/components/ScoreToast"
import SoloRewardToast from "@razzoozle/web/features/game/components/SoloRewardToast"
import SoloAnswers from "@razzoozle/web/features/game/components/states/SoloAnswers"
import Question from "@razzoozle/web/features/game/components/states/Question"
import SoloShell from "@razzoozle/web/features/game/components/solo/SoloShell"
import NameScreen from "@razzoozle/web/features/game/components/solo/SoloNameScreen"
import FinishedScreen from "@razzoozle/web/features/game/components/solo/SoloFinishedScreen"
import SoloFooterControls from "@razzoozle/web/features/game/components/solo/SoloFooterControls"
import {
  SoloAutoAdvance,
  SoloResultAutoAdvance,
} from "@razzoozle/web/features/game/components/solo/SoloAutoAdvance"

// ─────────────────────────────────────────────────────────────────────────
// Error screen for closed/invalid assignments
// ─────────────────────────────────────────────────────────────────────────

interface AssignmentErrorScreenProps {
  title: string
  message: string
}

const AssignmentErrorScreen = ({
  title,
  message,
}: AssignmentErrorScreenProps) => {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <section className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[var(--color-field-cream)] px-6 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col items-center gap-3"
      >
        <h1 className="text-3xl font-bold text-[color:var(--color-field-ink)]">{title}</h1>
        <p className="max-w-md text-lg text-[color:var(--color-field-ink)]/70">{message}</p>
      </motion.div>

      <button
        type="button"
        onClick={() => navigate({ to: "/" })}
        className="mt-6 rounded-xl bg-white px-6 py-3 font-bold text-black transition-all hover:bg-gray-100 active:scale-95"
      >
        {t("common:home", { defaultValue: "Zur Startseite" })}
      </button>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Main assignment play page
// ─────────────────────────────────────────────────────────────────────────

const AssignmentPlayPage = () => {
  const { id, assignmentId } = useParams({
    from: "/quizz/$id/assignment/$assignmentId",
  })
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { updatePoints } = usePlayerStore()

  const [assignmentStatus, setAssignmentStatus] = useState<
    "loading" | "valid" | "closed" | "error"
  >("loading")
  const [assignmentError, setAssignmentError] = useState<string>("")

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
    setAssignmentId,
    startGame,
    nextQuestion,
    autoAdvance,
    toggleAutoAdvance,
    finishGame,
    reset,
  } = useSoloStore()

  const finishedRef = useRef(false)

  // 1. Load and validate assignment
  useEffect(() => {
    let cancelled = false

    const loadAssignment = async () => {
      try {
        const res = await fetch(
          `/api/assignment/${encodeURIComponent(assignmentId)}`,
        )
        if (!res.ok) {
          if (!cancelled) {
            setAssignmentStatus("error")
            setAssignmentError(
              t("assignment:error.notFound", {
                defaultValue: "Aufgabe nicht gefunden",
              }),
            )
          }
          return
        }

        const assignment = (await res.json()) as {
          id: string
          quizzId: string
          deadline?: number
        }

        // Check deadline
        if (
          assignment.deadline &&
          assignment.deadline < Date.now()
        ) {
          if (!cancelled) {
            setAssignmentStatus("closed")
            setAssignmentError(
              t("assignment:error.closed", {
                defaultValue: "Diese Aufgabe ist geschlossen",
              }),
            )
          }
          return
        }

        if (!cancelled) {
          setAssignmentStatus("valid")
          setAssignmentId(assignmentId)
          void loadQuiz(assignment.quizzId)
        }
      } catch (err) {
        if (!cancelled) {
          setAssignmentStatus("error")
          setAssignmentError(
            t("assignment:error.networkLoad", {
              defaultValue: "Netzwerkfehler beim Laden der Aufgabe",
            }),
          )
          console.error("Assignment load error:", err)
        }
      }
    }

    void loadAssignment()

    return () => {
      cancelled = true
      reset()
    }
    // oxlint-disable-next-line
  }, [assignmentId])

  // 2. When phase = "finished", submit score with assignmentId
  useEffect(() => {
    if (phase === "finished" && !finishedRef.current) {
      finishedRef.current = true
      void finishGame(id)
    }
    // oxlint-disable-next-line
  }, [phase])

  // 3. Keep player store points in sync
  useEffect(() => {
    updatePoints(totalPoints)
  }, [totalPoints, updatePoints])

  // ─ Loading state
  if (assignmentStatus === "loading") {
    return (
      <section className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[var(--color-field-cream)]">
        <Loader className="h-20" />
        <p className="text-xl font-bold text-[color:var(--color-field-ink)]">
          {t("common:connecting")}
        </p>
      </section>
    )
  }

  // ─ Assignment closed or error
  if (assignmentStatus === "closed" || assignmentStatus === "error") {
    return (
      <AssignmentErrorScreen
        title={assignmentStatus === "closed" ? t(
          "assignment:error.closed",
          { defaultValue: "Diese Aufgabe ist geschlossen" },
        ) : t(
          "assignment:error.notFound",
          { defaultValue: "Aufgabe nicht gefunden" },
        )}
        message={assignmentError}
      />
    )
  }

  // ─ Solo quiz error
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

  // ─ Solo quiz loading
  if (phase === "idle" || phase === "loading") {
    return (
      <section className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[var(--color-field-cream)]">
        <Loader className="h-20" />
        <p className="text-xl font-bold text-[color:var(--color-field-ink)]">{t("common:connecting")}</p>
      </section>
    )
  }

  // ─ Name entry
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

  // ─ Finished
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
        variant="assignment"
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
            <SoloAutoAdvance cooldown={currentQuestion.cooldown} />
          </div>
        )}

        {(phase === "answering" || phase === "result") && (
          <SoloAnswers quizzId={id} question={currentQuestion} />
        )}

        {phase === "result" && autoAdvance && <SoloResultAutoAdvance />}
      </SoloShell>

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

export const Route = createFileRoute("/quizz/$id/assignment/$assignmentId")({
  component: AssignmentPlayPage,
})
