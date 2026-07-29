/**
 * /quizz/:id/practice — Solo UX; score POSTs to practice-score (not ranked).
 */
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router"
import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import Loader from "@razzoozle/web/components/Loader"
import SoloAnswers from "@razzoozle/web/features/game/components/states/SoloAnswers"
import SoloShell from "@razzoozle/web/features/game/components/solo/SoloShell"
import NameScreen from "@razzoozle/web/features/game/components/solo/SoloNameScreen"
import { useSoloStore } from "@razzoozle/web/features/game/stores/solo"

const PracticePage = () => {
  const { id } = useParams({ from: "/quizz/$id/practice" })
  const { t } = useTranslation()
  const navigate = useNavigate()
  const {
    phase,
    questions,
    currentIndex,
    subject,
    playerName,
    totalPoints,
    lastResult,
    error,
    loadQuiz,
    setPlayerName,
    startGame,
    nextQuestion,
    finishGame,
    finishPractice,
    reset,
  } = useSoloStore()
  const finishedRef = useRef(false)

  useEffect(() => {
    void loadQuiz(id)
    return () => reset()
    // oxlint-disable-next-line
  }, [id])

  useEffect(() => {
    if (phase === "finished" && !finishedRef.current) {
      finishedRef.current = true
      void finishPractice(id)
    }
  }, [phase, id, finishPractice])

  if (phase === "loading" || phase === "idle") return <Loader />
  if (error) {
    return <div className="p-6 text-center text-red-600">{error}</div>
  }

  return (
    <SoloShell
      variant="solo"
      playerName={playerName || "—"}
      totalPoints={totalPoints}
      phaseKey={currentIndex}
      questionCurrent={currentIndex + 1}
      questionTotal={questions.length}
    >
      <div
        className="bg-amber-50 px-3 py-2 text-center text-sm text-amber-900"
        data-testid="practice-banner"
      >
        {t("game:practice.banner", {
          defaultValue: "Practice run — your score will not be ranked",
        })}
      </div>
      {phase === "name" && (
        <NameScreen
          subject={subject}
          onStart={(name) => {
            setPlayerName(name)
            startGame()
          }}
        />
      )}
      {(phase === "question" || phase === "answering" || phase === "result") &&
        questions[currentIndex] && (
          <SoloAnswers
            key={currentIndex}
            question={questions[currentIndex]!}
            quizzId={id}
          />
        )}
      {phase === "finished" && (
        <div
          className="flex flex-col items-center gap-4 p-6"
          data-testid="practice-finished"
        >
          <p className="text-lg font-semibold">
            {t("game:practice.finished", {
              defaultValue: "Practice complete",
            })}
          </p>
          <p data-testid="practice-score">
            {t("game:solo.yourScore")}: {totalPoints}
          </p>
          <p className="text-sm text-[color:var(--game-fg)]/70">
            {t("game:practice.notRanked", {
              defaultValue: "Not ranked — practice only",
            })}
          </p>
          <button
            type="button"
            className="min-h-12 rounded-xl bg-[var(--color-primary)] px-6 text-white"
            onClick={() => {
              finishedRef.current = false
              reset()
              void loadQuiz(id)
            }}
          >
            {t("game:solo.replay")}
          </button>
          <button
            type="button"
            className="min-h-11 text-sm underline"
            onClick={() => void navigate({ to: "/" as never })}
          >
            {t("common:back", { defaultValue: "Home" })}
          </button>
        </div>
      )}
      {phase === "result" && lastResult && (
        <button
          type="button"
          className="mx-auto my-4 min-h-12 rounded-xl border px-6"
          onClick={() => {
            if (currentIndex >= questions.length - 1) void finishGame(id)
            else nextQuestion()
          }}
        >
          {currentIndex >= questions.length - 1
            ? t("game:solo.finish")
            : t("game:solo.next")}
        </button>
      )}
    </SoloShell>
  )
}

export const Route = createFileRoute("/quizz/$id/practice")({
  component: PracticePage,
})

export default PracticePage
